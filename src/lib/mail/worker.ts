/**
 * 送信ワーカー: queued の宛先を100件ずつ Resend の batch API で送る
 * - mm_claim_batch で queued → sending（並行して動いても同じ宛先を取り合わない）
 * - Idempotency-Key = mm-{配信ID}-{バッチ番号}。途中で落ちたバッチは同じキー・同じ中身で再送するので二重送信にならない
 * - 時間切れが近づいたら止める。続きはCron（/api/cron/mail-dispatch）が拾う
 */
import { db, getCampaign, getSettings, liveSendEnabled, MailError, type Campaign, type Delivery, type MailSettings } from './service'
import { renderForRecipient } from './render'
import { resend } from './resend'

const BATCH_SIZE = 100
const STALE_CLAIM_MS = 2 * 60_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function runCampaign(id: number, budgetMs = 240_000) {
  if (!liveSendEnabled()) return { skipped: '本配信は無効' }
  const deadline = Date.now() + budgetMs
  const campaign = await getCampaign(id)
  if (campaign.status !== 'sending') return { skipped: `status=${campaign.status}` }
  const settings = await getSettings()
  const heartbeat = () => db().from('mm_campaigns').update({ worker_heartbeat_at: new Date().toISOString() }).eq('id', id)
  await heartbeat()

  // 1. 前回途中で止まったバッチ（sending のまま放置）を同じキーで再送
  const stale = await db().from('mm_deliveries').select('*')
    .eq('campaign_id', id).eq('status', 'sending').is('resend_email_id', null)
    .lt('claimed_at', new Date(Date.now() - STALE_CLAIM_MS).toISOString()).order('id')
  const staleRows = (stale.data ?? []) as Delivery[]
  const staleBatches = new Map<number, Delivery[]>()
  for (const r of staleRows) staleBatches.set(r.batch_no ?? 0, [...(staleBatches.get(r.batch_no ?? 0) ?? []), r])
  for (const [batchNo, rows] of staleBatches) {
    if (Date.now() > deadline) return { paused: true }
    await sendBatch(campaign, settings, rows, batchNo, { skipSuppressionCheck: true })
    await sleep(600)
  }

  // 2. 新しいバッチ
  const maxRes = await db().from('mm_deliveries').select('batch_no').eq('campaign_id', id).not('batch_no', 'is', null)
    .order('batch_no', { ascending: false }).limit(1).maybeSingle()
  let batchNo = (maxRes.data as { batch_no: number } | null)?.batch_no ?? 0
  let sentBatches = 0
  while (Date.now() < deadline) {
    batchNo++
    const claimed = await db().rpc('mm_claim_batch', { p_campaign_id: id, p_size: BATCH_SIZE, p_batch_no: batchNo })
    if (claimed.error) throw new MailError(`宛先の取り出しに失敗しました: ${claimed.error.message}`, 500)
    const rows = (claimed.data ?? []) as Delivery[]
    if (rows.length === 0) break
    await sendBatch(campaign, settings, rows, batchNo)
    sentBatches++
    await heartbeat()
    await sleep(600) // Resendのレート制限（毎秒数リクエスト）を超えない
  }

  return finalizeIfDone(id, sentBatches)
}

async function finalizeIfDone(id: number, sentBatches: number) {
  const remaining = await db().from('mm_deliveries').select('id', { count: 'exact', head: true })
    .eq('campaign_id', id).in('status', ['queued', 'sending'])
  if ((remaining.count ?? 0) > 0) return { paused: true, sentBatches }
  const failed = await db().from('mm_deliveries').select('id', { count: 'exact', head: true }).eq('campaign_id', id).eq('status', 'failed')
  const status = (failed.count ?? 0) > 0 ? 'partial' : 'sent'
  const c = await db().from('mm_campaigns').update({ status, completed_at: new Date().toISOString(), worker_heartbeat_at: null })
    .eq('id', id).eq('status', 'sending').select('newsletter_id').maybeSingle()
  const nlId = (c.data as { newsletter_id: string | null } | null)?.newsletter_id
  if (nlId && status === 'sent') await db().from('newsletters').update({ status: 'sent' }).eq('id', nlId)
  return { done: true, status, sentBatches }
}

async function sendBatch(campaign: Campaign, settings: MailSettings, rows: Delivery[], batchNo: number, opts: { skipSuppressionCheck?: boolean } = {}) {
  let targets = rows
  if (!opts.skipSuppressionCheck) {
    // 宛先を更新した後に配信停止した人は送らない
    const sup = await db().from('mm_suppressions').select('email').eq('tenant_id', campaign.tenant_id).in('email', rows.map((r) => r.email))
    const suppressed = new Set(((sup.data ?? []) as Array<{ email: string }>).map((s) => s.email))
    const skip = rows.filter((r) => suppressed.has(r.email))
    if (skip.length) {
      await db().from('mm_deliveries').update({ status: 'skipped', error: '配信停止済み' }).in('id', skip.map((r) => r.id))
      targets = rows.filter((r) => !suppressed.has(r.email))
    }
  }
  if (targets.length === 0) return

  const payload = targets.map((r) => renderForRecipient(campaign, settings, {
    deliveryId: r.id, email: r.email, comp_name: r.comp_name, tanto_name: r.tanto_name,
  }))

  for (let attempt = 0; ; attempt++) {
    const res = await resend().batch.send(payload, {
      idempotencyKey: `mm-${campaign.id}-${batchNo}`,
      batchValidation: 'permissive',
    })
    if (!res.error) {
      const errors = new Map<number, string>(((res.data as { errors?: Array<{ index: number; message: string }> }).errors ?? []).map((e) => [e.index, e.message]))
      const ids = res.data.data
      const now = new Date().toISOString()
      let k = 0
      const updates = targets.map((r, i) => errors.has(i)
        ? { id: r.id, status: 'failed', error: errors.get(i)!.slice(0, 500), resend_email_id: null as string | null, sent_at: null as string | null }
        : { id: r.id, status: 'sent', error: null, resend_email_id: ids[k++]?.id ?? null, sent_at: now })
      await Promise.all(updates.map((u) => db().from('mm_deliveries')
        .update({ status: u.status, error: u.error, resend_email_id: u.resend_email_id, sent_at: u.sent_at }).eq('id', u.id)))
      return
    }
    const code = (res.error as { statusCode?: number }).statusCode ?? 0
    if ((code === 429 || code >= 500 || code === 0) && attempt < 3) {
      await sleep(2000 * (attempt + 1))
      continue
    }
    if (code >= 400 && code < 500 && code !== 429 && code !== 409) {
      // バッチ全体が受け付けられなかった（差出人未認証など）。行は failed にして画面に理由を出す
      await db().from('mm_deliveries').update({ status: 'failed', error: res.error.message.slice(0, 500) }).in('id', targets.map((r) => r.id))
      throw new MailError(`Resendが送信を受け付けませんでした: ${res.error.message}`, 502)
    }
    // 5xxが続く・409など: sending のまま残して中断（次回同じキーで再送される）
    throw new MailError(`Resendへの送信が一時的に失敗しました（あとで自動で再開します）: ${res.error.message}`, 502)
  }
}

/** Cron: 予約時刻を過ぎた配信を開始し、止まっている送信を再開する */
export async function dispatchDue() {
  if (!liveSendEnabled()) return { disabled: true }
  const now = new Date().toISOString()
  const due = await db().from('mm_campaigns').update({ status: 'sending', started_at: now, worker_heartbeat_at: null })
    .eq('status', 'scheduled').lte('scheduled_at', now).select('id')
  const staleBefore = new Date(Date.now() - 90_000).toISOString()
  const sending = await db().from('mm_campaigns').select('id, worker_heartbeat_at').eq('status', 'sending')
  const targets = ((sending.data ?? []) as Array<{ id: number; worker_heartbeat_at: string | null }>)
    .filter((c) => !c.worker_heartbeat_at || c.worker_heartbeat_at < staleBefore)
  const results: Record<number, unknown> = {}
  for (const c of targets) {
    try {
      results[c.id] = await runCampaign(c.id, 200_000)
    } catch (e) {
      results[c.id] = { error: e instanceof Error ? e.message : String(e) }
    }
  }
  return { started: (due.data ?? []).length, ran: results }
}
