/**
 * 見積書ルームからの自動取込
 *
 * 1. 入口チェック（ルールで固定）: 見積書ルーム以外 / システム自身の投稿 / ファイルなし → 何もしない
 *                                  投稿者がテンドール以外（修正依頼の参考添付など）/ 対象外の拡張子 → ignored として記録
 * 2. 判定（decide）: 依頼番号 #Q-n > 依頼投稿への返信 > 店舗名の一致 の順に確信度を付ける
 * 3. 確信度が高ければ自動で案件に保存（auto）、迷うものは仕分け待ち（inbox）に候補付きで入れる
 * 判定は decide() に閉じているので、将来AI判定（JEV等）に差し替える場合はここだけ変える。
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { downloadFile, fileIdsInBody, getFile, getMessage, listFiles, me, postMessage, quoteRoomId, reply } from './chatwork'
import { QUOTE_WAITING_STATUSES, type QuoteStatus } from './constants'
import type { SfaMember } from './member'
import { decide, type Candidate } from './quote-match'
import { addQuoteFile, ensureQuoteRequest, isQuoteMaker, ownerTenantId, SfaError } from './service'

export { decide, normalize, type Candidate, type Decision } from './quote-match'

const db = () => createAdminClient()
const ACCEPT_EXT = /\.(pdf|xlsx|xls|docx|doc)$/i

async function loadCandidates(): Promise<Candidate[]> {
  const since = new Date(Date.now() - 90 * 86400_000).toISOString()
  const { data, error } = await db().from('sfa_quote_requests')
    .select('id, deal_id, status, chatwork_message_id, requested_at, deal:sfa_deals!inner(tenant_id, company:sfa_companies(name))')
    .eq('deal.tenant_id', await ownerTenantId())
    .in('status', [...QUOTE_WAITING_STATUSES, '作成済', '提示済'])
    .gte('requested_at', since)
  if (error) throw new Error(error.message)
  return (data as unknown as Array<{ id: number; deal_id: number; status: QuoteStatus; chatwork_message_id: string | null; deal: { company: { name: string } | null } }>)
    .map((r) => ({
      quote_request_id: r.id, deal_id: r.deal_id, company_name: r.deal.company?.name ?? '', status: r.status,
      chatwork_message_id: r.chatwork_message_id, score: 0, reason: '',
    }))
}

// =============================================================
// 取込
// =============================================================
let systemAccountId: string | null = process.env.CHATWORK_SYSTEM_ACCOUNT_ID || null
async function getSystemAccountId() {
  if (!systemAccountId) systemAccountId = String((await me()).account_id)
  return systemAccountId
}

async function memberByChatwork(accountId: string): Promise<SfaMember | null> {
  const { data } = await db().from('sfa_members')
    .select('id, name, tenant_id, role, email, auth_user_id, chatwork_account_id, chatwork_room_id, active')
    .eq('chatwork_account_id', accountId).eq('active', true).maybeSingle()
  return (data as SfaMember) ?? null
}

async function alreadyHandled(messageId: string, fileId: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    db().from('sfa_chatwork_inbox').select('id').eq('message_id', messageId).eq('file_id', fileId).limit(1),
    db().from('sfa_quote_files').select('id').eq('chatwork_file_id', fileId).limit(1),
  ])
  return !!(a.data?.length || b.data?.length)
}

async function log(row: Record<string, unknown>) {
  await db().from('sfa_chatwork_inbox').upsert(row, { onConflict: 'message_id,file_id' })
}

export interface IngestResult { file_id: string; decision: string; reason: string; deal_id?: number; version?: number }

/** 見積書ルームの1メッセージを処理する（Webhook・同期の共通入口） */
export async function ingestMessage(msg: { room_id: string; message_id: string; account_id: string; account_name?: string; body: string }): Promise<IngestResult[]> {
  if (!quoteRoomId() || msg.room_id !== quoteRoomId()) return []
  if (msg.account_id === (await getSystemAccountId())) return []
  const fileIds = fileIdsInBody(msg.body)
  if (!fileIds.length) return []

  const poster = await memberByChatwork(msg.account_id)
  const results: IngestResult[] = []
  for (const fileId of fileIds) {
    if (await alreadyHandled(msg.message_id, fileId)) continue
    const meta = await getFile(msg.room_id, fileId)
    const base = {
      room_id: msg.room_id, message_id: msg.message_id, file_id: fileId, account_id: msg.account_id,
      account_name: msg.account_name ?? meta.account.name, file_name: meta.filename, body: msg.body.slice(0, 4000),
    }
    if (!poster || !(await isQuoteMaker(poster))) {
      const reason = poster ? `投稿者（${poster.name}）が見積作成側ではない（修正依頼の参考添付など）` : '投稿者がSFAメンバーに未登録'
      await log({ ...base, decision: 'ignored', reason })
      results.push({ file_id: fileId, decision: 'ignored', reason })
      continue
    }
    if (!ACCEPT_EXT.test(meta.filename)) {
      await log({ ...base, decision: 'ignored', reason: '見積書として扱わない拡張子' })
      results.push({ file_id: fileId, decision: 'ignored', reason: '拡張子対象外' })
      continue
    }

    const d = decide({ fileName: meta.filename, body: msg.body }, await loadCandidates())
    if (d.decision === 'auto' && d.best) {
      const { buffer } = await downloadFile(msg.room_id, fileId)
      const saved = await addQuoteFile(poster, {
        quote_request_id: d.best.quote_request_id, buffer, file_name: meta.filename, source: 'chatwork', chatwork_file_id: fileId,
      })
      await log({ ...base, decision: 'auto', reason: d.reason, confidence: d.confidence, candidates: d.candidates, quote_request_id: d.best.quote_request_id, quote_file_id: saved.quote_file_id })
      await postMessage(msg.room_id, `${reply(msg.account_id, msg.room_id, msg.message_id)}\n✅ ${d.best.company_name} 様の案件に登録しました（第${saved.version}版・#Q-${d.best.quote_request_id}）`).catch(() => null)
      results.push({ file_id: fileId, decision: 'auto', reason: d.reason, deal_id: saved.deal_id, version: saved.version })
    } else {
      await log({ ...base, decision: 'inbox', reason: d.reason, confidence: d.confidence, candidates: d.candidates })
      await postMessage(msg.room_id, `${reply(msg.account_id, msg.room_id, msg.message_id)}\n⚠ 「${meta.filename}」の店舗を特定できなかったため、仕分け待ちに入れました（${d.reason}）。SFAで紐付けます。`).catch(() => null)
      results.push({ file_id: fileId, decision: 'inbox', reason: d.reason })
    }
  }
  return results
}

/** 取りこぼし回収: ルームのファイル一覧から未処理のものを取り込む（cron・手動ボタン） */
export async function syncQuoteRoom(): Promise<IngestResult[]> {
  const room = quoteRoomId()
  if (!room) throw new SfaError('CHATWORK_QUOTE_ROOM_ID が未設定です')
  const files = await listFiles(room)
  const recent = files.filter((f) => f.upload_time * 1000 > Date.now() - 14 * 86400_000)
  const out: IngestResult[] = []
  const seen = new Set<string>()
  for (const f of recent) {
    if (seen.has(f.message_id) || (await alreadyHandled(f.message_id, String(f.file_id)))) continue
    seen.add(f.message_id)
    const m = await getMessage(room, f.message_id)
    out.push(...await ingestMessage({ room_id: room, message_id: m.message_id, account_id: String(m.account.account_id), account_name: m.account.name, body: m.body }))
  }
  return out
}

/** 仕分け待ちの一覧 */
export async function listInbox(includeIgnored = false) {
  const { data, error } = await db().from('sfa_chatwork_inbox').select('*')
    .in('decision', includeIgnored ? ['inbox', 'ignored'] : ['inbox']).order('created_at', { ascending: false }).limit(100)
  if (error) throw new Error(error.message)
  return data
}

/** 仕分け待ちを人が確定する（見積依頼 or 案件を指定） */
export async function resolveInbox(member: SfaMember, inboxId: number, target: { quote_request_id?: number; deal_id?: number }) {
  const { data: row, error } = await db().from('sfa_chatwork_inbox').select('*').eq('id', inboxId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!row) throw new SfaError('仕分け待ちが見つかりません', 404)
  if (row.decision === 'auto' || row.decision === 'resolved') throw new SfaError('すでに紐付け済みです')
  const qrId = target.quote_request_id ?? (target.deal_id ? await ensureQuoteRequest(target.deal_id) : null)
  if (!qrId) throw new SfaError('紐付け先の見積依頼または案件を指定してください')

  const { buffer } = await downloadFile(row.room_id, row.file_id)
  const uploader = row.account_id ? await memberByChatwork(row.account_id) : null
  const saved = await addQuoteFile(uploader, {
    quote_request_id: qrId, buffer, file_name: row.file_name, source: 'chatwork', chatwork_file_id: row.file_id,
    note: `仕分け待ちから紐付け（${member.name}）`,
  })
  await db().from('sfa_chatwork_inbox').update({
    decision: 'resolved', quote_request_id: qrId, quote_file_id: saved.quote_file_id, resolved_by_id: member.id, resolved_at: new Date().toISOString(),
  }).eq('id', inboxId)
  return saved
}

export async function dismissInbox(member: SfaMember, inboxId: number) {
  await db().from('sfa_chatwork_inbox').update({ decision: 'ignored', reason: `手動で対象外にした（${member.name}）`, resolved_by_id: member.id, resolved_at: new Date().toISOString() })
    .eq('id', inboxId).eq('decision', 'inbox')
}
