/**
 * メルマガ配信のサービス層（UI・API・Cronはここを呼ぶだけにする）
 * 設計書: 01_Specs/メルマガ配信_Resend実装設計書.md v0.2
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { SFA_OWNER_TENANT_NAME } from '@/lib/sfa/constants'
import { fetchAllCustomers, fetchViewGroups, updateCustomerMmFlag } from './bcart'
import { computeAudience, findResubscribed, type AudienceSummary, type SuppressionRow } from './audience'
import { renderForRecipient, DEFAULT_FOOTER_HTML, type RenderSettings } from './render'
import { resend } from './resend'

export class MailError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

/** Supabaseの結果を取り出す（型なしクライアントなので呼び出し側で型を付ける） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function must(res: { data: unknown; error: { message: string } | null }, what: string): any {
  if (res.error) throw new MailError(`${what}に失敗しました: ${res.error.message}`, 500)
  return res.data
}

export const db = () => createAdminClient()

/** 本配信（予約・再開を含む）を許可するか。送信ドメインの認証が済むまでは止めておく（MAIL_SEND_ENABLED=true で解禁） */
export function liveSendEnabled(): boolean {
  return process.env.MAIL_SEND_ENABLED === 'true'
}

function assertLiveSendEnabled() {
  if (!liveSendEnabled()) throw new MailError('本配信はまだ準備中です（送信ドメインの認証後に有効になります）。テスト配信は使えます', 403)
}

let tenantCache: string | null = null
/** 配信の持ち主テナント（テンドール物流） */
export async function mailTenantId(): Promise<string> {
  if (tenantCache) return tenantCache
  const row = must(await db().from('tenants').select('id').eq('name', SFA_OWNER_TENANT_NAME).single(), 'テナント取得')
  tenantCache = (row as { id: string }).id
  return tenantCache
}

// ───────── 型 ─────────

export type CampaignStatus = 'draft' | 'tested' | 'scheduled' | 'sending' | 'sent' | 'partial' | 'canceled'

export interface MailSettings extends RenderSettings {
  tenant_id: string
  excluded_view_group_ids: number[]
  test_recipients: string[]
}

export type { AudienceSummary }

export interface Campaign {
  id: number
  tenant_id: string
  newsletter_id: string | null
  subject: string
  preheader: string | null
  greeting: boolean
  html_snapshot: string
  status: CampaignStatus
  test_sent_at: string | null
  audience_refreshed_at: string | null
  audience_summary: AudienceSummary | null
  recipient_count: number | null
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  worker_heartbeat_at: string | null
  created_at: string
  updated_at: string
}

export interface Delivery {
  id: number
  campaign_id: number
  bcart_customer_id: number
  email: string
  comp_name: string | null
  tanto_name: string | null
  view_group_id: number | null
  status: string
  batch_no: number | null
  resend_email_id: string | null
}

// ───────── 設定 ─────────

export async function getSettings(): Promise<MailSettings> {
  const tenant_id = await mailTenantId()
  const existing = must(await db().from('mm_settings').select('*').eq('tenant_id', tenant_id).maybeSingle(), '配信設定の取得')
  if (existing) return existing as MailSettings
  return must(await db().from('mm_settings').insert({ tenant_id }).select('*').single(), '配信設定の作成') as MailSettings
}

export async function updateSettings(patch: Partial<Pick<MailSettings,
  'excluded_view_group_ids' | 'from_name' | 'from_email' | 'reply_to' | 'footer_html' | 'test_recipients'>>) {
  const s = await getSettings()
  if (patch.footer_html && !patch.footer_html.includes('{{UNSUBSCRIBE_URL}}')) {
    throw new MailError('フッターには配信停止リンク {{UNSUBSCRIBE_URL}} を必ず入れてください')
  }
  return must(await db().from('mm_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('tenant_id', s.tenant_id).select('*').single(), '配信設定の更新') as MailSettings
}

export async function getSettingsWithGroups() {
  const [settings, groups] = await Promise.all([getSettings(), fetchViewGroups().catch(() => [])])
  return { settings, viewGroups: groups, defaultFooterHtml: DEFAULT_FOOTER_HTML, envFromEmail: process.env.MAIL_FROM_EMAIL || null, liveSendEnabled: liveSendEnabled() }
}

// ───────── 配信（キャンペーン） ─────────

export async function listCampaigns() {
  const tenant_id = await mailTenantId()
  const rows = must(await db().from('mm_campaigns')
    .select('id, subject, status, recipient_count, scheduled_at, started_at, completed_at, test_sent_at, created_at, newsletter_id')
    .eq('tenant_id', tenant_id).order('created_at', { ascending: false }).limit(100), '配信一覧の取得') as Array<Partial<Campaign> & { id: number }>
  const stats = await Promise.all(rows.map((r) =>
    ['sending', 'sent', 'partial'].includes(r.status as string) ? campaignStats(r.id) : Promise.resolve(null)))
  return rows.map((r, i) => ({ ...r, stats: stats[i] }))
}

export async function getCampaign(id: number): Promise<Campaign> {
  const tenant_id = await mailTenantId()
  const row = must(await db().from('mm_campaigns').select('*').eq('id', id).eq('tenant_id', tenant_id).maybeSingle(), '配信の取得')
  if (!row) throw new MailError('配信が見つかりません', 404)
  return row as Campaign
}

export async function createCampaign(input: { newsletter_id: string; html?: string; subject?: string; userId: string }) {
  const tenant_id = await mailTenantId()
  const nl = must(await db().from('newsletters').select('id, title, html_output, draft_data').eq('id', input.newsletter_id).maybeSingle(), 'メルマガの取得') as
    { id: string; title: string; html_output: string | null; draft_data: { formFields?: { subject?: string } } | null } | null
  if (!nl) throw new MailError('メルマガが見つかりません', 404)
  const html = input.html || nl.html_output
  if (!html) throw new MailError('メルマガのHTMLがまだ出力されていません')
  const subject = input.subject || nl.draft_data?.formFields?.subject || nl.title
  return must(await db().from('mm_campaigns').insert({
    tenant_id,
    newsletter_id: nl.id,
    subject,
    html_snapshot: html,
    created_by: input.userId,
  }).select('*').single(), '配信の作成') as Campaign
}

/** 配信に使えるメルマガ（HTML出力済み）。すでに配信を作ったものは、その配信の状態も返す */
export async function listSendableNewsletters() {
  const tenant_id = await mailTenantId()
  const nls = must(await db().from('newsletters').select('id, title, status, draft_data, updated_at')
    .not('html_output', 'is', null).order('updated_at', { ascending: false }).limit(50), 'メルマガ一覧の取得') as
    Array<{ id: string; title: string; status: string; draft_data: { formFields?: { subject?: string } } | null; updated_at: string }>
  const camps = must(await db().from('mm_campaigns').select('id, newsletter_id, status, started_at')
    .eq('tenant_id', tenant_id).in('newsletter_id', nls.map((n) => n.id)).order('created_at', { ascending: false }), '配信の取得') as
    Array<{ id: number; newsletter_id: string; status: CampaignStatus; started_at: string | null }>
  return nls.map((n) => ({
    id: n.id,
    title: n.title,
    subject: n.draft_data?.formFields?.subject || n.title,
    updated_at: n.updated_at,
    campaigns: camps.filter((c) => c.newsletter_id === n.id).map(({ id, status, started_at }) => ({ id, status, started_at })),
  }))
}

const EDITABLE: CampaignStatus[] = ['draft', 'tested', 'scheduled']

/** 件名・本文などを変えたらテストからやり直し（予約も外す） */
export async function updateCampaign(id: number, patch: Partial<Pick<Campaign, 'subject' | 'preheader' | 'greeting' | 'html_snapshot'>>) {
  const c = await getCampaign(id)
  if (!EDITABLE.includes(c.status)) throw new MailError('送信を始めた配信は変更できません')
  const changed = (Object.keys(patch) as Array<keyof typeof patch>).some((k) => patch[k] !== undefined && patch[k] !== c[k])
  return must(await db().from('mm_campaigns').update({
    ...patch,
    ...(changed && c.status !== 'draft' ? { status: 'draft', scheduled_at: null } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('*').single(), '配信の更新') as Campaign
}

export async function deleteCampaign(id: number) {
  const c = await getCampaign(id)
  if (!['draft', 'tested', 'canceled'].includes(c.status)) throw new MailError('送信済み・予約中の配信は削除できません')
  must(await db().from('mm_campaigns').delete().eq('id', id), '配信の削除')
}

export async function previewHtml(id: number) {
  const [c, s] = await Promise.all([getCampaign(id), getSettings()])
  const sample = c.audience_refreshed_at
    ? (must(await db().from('mm_deliveries').select('comp_name, tanto_name, email').eq('campaign_id', id).limit(1).maybeSingle(), '宛先の取得') as
      { comp_name: string; tanto_name: string; email: string } | null)
    : null
  return renderForRecipient(c, { ...s, from_email: s.from_email || process.env.MAIL_FROM_EMAIL || 'not-set@example.com' }, {
    deliveryId: 0,
    email: sample?.email || 'sample@example.com',
    comp_name: sample?.comp_name || '株式会社サンプル',
    tanto_name: sample?.tanto_name || '山田 太郎',
  }).html
}

// ───────── 宛先（「宛先を更新」ボタン） ─────────

/** 「宛先を更新」: Bカートから会員を取得し、送る人を判定して送信記録（queued）を作り直す */
export async function refreshAudience(id: number) {
  const c = await getCampaign(id)
  if (!EDITABLE.includes(c.status)) throw new MailError('送信を始めた配信の宛先は更新できません')
  const [settings, customers, groups] = await Promise.all([getSettings(), fetchAllCustomers(), fetchViewGroups()])
  const suppressions = must(await db().from('mm_suppressions').select('id, email, reason, bcart_customer_id, bcart_synced_at')
    .eq('tenant_id', c.tenant_id), '停止リストの取得') as SuppressionRow[]
  // 停止のあとBカートで受信をONに戻した人は、停止リストから外して送る対象に戻す
  const resubscribed = findResubscribed(customers, suppressions)
  if (resubscribed.length) must(await db().from('mm_suppressions').delete().in('id', resubscribed.map((s) => s.id)), '停止リストの解除')
  const lifted = new Set(resubscribed.map((s) => s.id))
  const suppressed = new Set(suppressions.filter((s) => !lifted.has(s.id)).map((s) => s.email))
  const audience = computeAudience(customers, groups, settings.excluded_view_group_ids, suppressed)
  audience.summary.resubscribed = resubscribed.length
  const rows = audience.rows.map((r) => ({ ...r, campaign_id: id }))
  const summary = audience.summary

  must(await db().from('mm_deliveries').delete().eq('campaign_id', id), '古い宛先の削除')
  for (let i = 0; i < rows.length; i += 500) {
    must(await db().from('mm_deliveries').insert(rows.slice(i, i + 500)), '宛先の保存')
  }
  return must(await db().from('mm_campaigns').update({
    audience_refreshed_at: new Date().toISOString(),
    audience_summary: summary,
    recipient_count: rows.length,
    // 予約中に宛先を変えたら、件数を確認し直してもらうため予約を外す
    ...(c.status === 'scheduled' ? { status: 'tested', scheduled_at: null } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('*').single(), '配信の更新') as Campaign
}

/** 宛先一覧（画面確認用） */
export async function listRecipients(id: number, opts: { q?: string; limit?: number; offset?: number } = {}) {
  await getCampaign(id)
  let q = db().from('mm_deliveries')
    .select('id, bcart_customer_id, email, comp_name, tanto_name, view_group_id, status, open_count, click_count, unsubscribed_at, error', { count: 'exact' })
    .eq('campaign_id', id).order('id')
  if (opts.q) q = q.or(`email.ilike.%${opts.q}%,comp_name.ilike.%${opts.q}%,tanto_name.ilike.%${opts.q}%`)
  const res = await q.range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 50) - 1)
  if (res.error) throw new MailError(`宛先の取得に失敗しました: ${res.error.message}`, 500)
  return { rows: res.data ?? [], total: res.count ?? 0 }
}

// ───────── テスト配信 ─────────

export async function sendTest(id: number, emails: string[]) {
  const list = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))]
  if (list.length === 0) throw new MailError('テスト送信先のアドレスを入力してください')
  if (list.length > 5) throw new MailError('テスト配信は5件までです')
  const [c, s] = await Promise.all([getCampaign(id), getSettings()])
  if (!EDITABLE.includes(c.status)) throw new MailError('送信を始めた配信はテストできません')
  // 宛先を更新済みなら、実際の宛先の1件目の会社名・担当者名で差し込みを確認できるようにする
  const sample = must(await db().from('mm_deliveries').select('comp_name, tanto_name').eq('campaign_id', id).limit(1).maybeSingle(), '宛先の取得') as
    { comp_name: string | null; tanto_name: string | null } | null
  const payload = list.map((email) => renderForRecipient(c, s, {
    deliveryId: 0, email,
    comp_name: sample?.comp_name ?? '株式会社サンプル',
    tanto_name: sample?.tanto_name ?? '山田 太郎',
  }, { test: true }))
  const { error } = await resend().batch.send(payload)
  if (error) throw new MailError(`テスト配信に失敗しました: ${error.message}`, 502)
  must(await db().from('mm_campaigns').update({
    test_sent_at: new Date().toISOString(),
    status: c.status === 'draft' ? 'tested' : c.status,
    updated_at: new Date().toISOString(),
  }).eq('id', id), '配信の更新')
  must(await db().from('mm_settings').update({ test_recipients: list }).eq('tenant_id', c.tenant_id), '設定の更新')
  return { sent: list.length }
}

// ───────── 本配信・予約 ─────────

/**
 * 本配信を確定する。scheduledAt があれば予約、なければすぐ送信開始（呼び出し側で runCampaign を動かす）
 * confirmCount は画面で入力させた件数（誤送信防止）
 */
export async function startSend(id: number, confirmCount: number, scheduledAt?: string | null) {
  assertLiveSendEnabled()
  const c = await getCampaign(id)
  if (!['tested', 'scheduled'].includes(c.status)) {
    throw new MailError(c.status === 'draft' ? 'テスト配信をしてから本配信してください' : 'この配信はすでに送信済みか送信中です')
  }
  if (!c.audience_refreshed_at || !c.recipient_count) throw new MailError('「宛先を更新」を押して宛先を確定してください')
  if (confirmCount !== c.recipient_count) throw new MailError(`入力された件数（${confirmCount}）が宛先の件数（${c.recipient_count}）と一致しません`)
  fromAddressCheck(await getSettings())

  if (scheduledAt) {
    const at = new Date(scheduledAt)
    if (Number.isNaN(at.getTime())) throw new MailError('予約日時が正しくありません')
    if (at.getTime() < Date.now() + 60_000) throw new MailError('予約日時は1分以上先にしてください')
    const rows = must(await db().from('mm_campaigns').update({ status: 'scheduled', scheduled_at: at.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id).in('status', ['tested', 'scheduled']).select('*'), '予約') as Campaign[]
    if (rows.length === 0) throw new MailError('状態が変わったため予約できませんでした。画面を更新してください', 409)
    return { campaign: rows[0], startNow: false }
  }
  const rows = must(await db().from('mm_campaigns').update({
    status: 'sending', scheduled_at: null, started_at: new Date().toISOString(), worker_heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', id).in('status', ['tested', 'scheduled']).select('*'), '送信開始') as Campaign[]
  if (rows.length === 0) throw new MailError('すでに送信が始まっています', 409)
  return { campaign: rows[0], startNow: true }
}

function fromAddressCheck(s: MailSettings) {
  if (!s.from_email && !process.env.MAIL_FROM_EMAIL) throw new MailError('差出人アドレスが未設定です（配信設定で設定してください）')
}

export async function cancelSchedule(id: number) {
  const rows = must(await db().from('mm_campaigns').update({ status: 'tested', scheduled_at: null, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'scheduled').select('*'), '予約の取り消し') as Campaign[]
  if (rows.length === 0) throw new MailError('予約中の配信ではありません')
  return rows[0]
}

/** 一部失敗・中断した配信を再開（failed を queued に戻す） */
export async function prepareResume(id: number) {
  assertLiveSendEnabled()
  const c = await getCampaign(id)
  if (!['partial', 'sending'].includes(c.status)) throw new MailError('再開できる状態ではありません')
  must(await db().from('mm_deliveries').update({ status: 'queued', error: null }).eq('campaign_id', id).eq('status', 'failed'), '再開準備')
  must(await db().from('mm_campaigns').update({ status: 'sending', completed_at: null, worker_heartbeat_at: new Date().toISOString() }).eq('id', id), '再開')
}

// ───────── 集計・レポート ─────────

export interface CampaignStats {
  total: number; queued: number; sending: number; sent: number; delivered: number; bounced: number
  complained: number; failed: number; skipped: number; opened: number; clicked: number; unsubscribed: number
}

export async function campaignStats(id: number): Promise<CampaignStats> {
  return must(await db().rpc('mm_campaign_stats', { p_campaign_id: id }), '集計') as CampaignStats
}

export async function campaignReport(id: number) {
  const c = await getCampaign(id)
  const stats = await campaignStats(id)
  const clickers = must(await db().from('mm_deliveries')
    .select('id, bcart_customer_id, email, comp_name, tanto_name, click_count, first_clicked_at')
    .eq('campaign_id', id).gt('click_count', 0).order('first_clicked_at'), 'クリック会員の取得') as
    Array<{ id: number; bcart_customer_id: number; email: string; comp_name: string | null; tanto_name: string | null; click_count: number; first_clicked_at: string }>
  const events = must(await db().from('mm_events').select('delivery_id, link_url').eq('campaign_id', id).eq('type', 'email.clicked'), 'クリックの取得') as
    Array<{ delivery_id: number | null; link_url: string | null }>
  const links = new Map<string, { clicks: number; people: Set<number> }>()
  const linksByDelivery = new Map<number, Set<string>>()
  for (const e of events) {
    if (!e.link_url) continue
    const l = links.get(e.link_url) ?? { clicks: 0, people: new Set<number>() }
    l.clicks++
    if (e.delivery_id) {
      l.people.add(e.delivery_id)
      linksByDelivery.set(e.delivery_id, (linksByDelivery.get(e.delivery_id) ?? new Set()).add(e.link_url))
    }
    links.set(e.link_url, l)
  }
  return {
    campaign: c,
    stats,
    links: [...links.entries()].map(([url, v]) => ({ url, clicks: v.clicks, people: v.people.size })).sort((a, b) => b.people - a.people),
    clickers: clickers.map((r) => ({ ...r, links: [...(linksByDelivery.get(r.id) ?? [])] })),
  }
}

// ───────── 配信停止 ─────────

export async function describeUnsubscribe(deliveryId: number) {
  if (deliveryId === 0) return { test: true as const, email: null, done: false }
  const d = must(await db().from('mm_deliveries').select('email, unsubscribed_at').eq('id', deliveryId).maybeSingle(), '宛先の取得') as
    { email: string; unsubscribed_at: string | null } | null
  if (!d) throw new MailError('配信停止のリンクが正しくありません', 404)
  return { test: false as const, email: d.email, done: !!d.unsubscribed_at }
}

/** 配信停止（停止リストに入れてからBカートへ書き戻す。書き戻しに失敗してもCronで再試行） */
export async function unsubscribe(deliveryId: number, reason: 'unsubscribed' | 'complained' = 'unsubscribed') {
  if (deliveryId === 0) return { test: true }
  const d = must(await db().from('mm_deliveries').select('id, email, bcart_customer_id, campaign_id, mm_campaigns(tenant_id)').eq('id', deliveryId).maybeSingle(), '宛先の取得') as
    { id: number; email: string; bcart_customer_id: number; campaign_id: number; mm_campaigns: { tenant_id: string } } | null
  if (!d) throw new MailError('配信停止のリンクが正しくありません', 404)
  await addSuppression({ tenant_id: d.mm_campaigns.tenant_id, email: d.email, reason, campaign_id: d.campaign_id, bcart_customer_id: d.bcart_customer_id })
  must(await db().from('mm_deliveries').update({ unsubscribed_at: new Date().toISOString() }).eq('id', d.id).is('unsubscribed_at', null), '宛先の更新')
  return { test: false }
}

async function addSuppression(s: { tenant_id: string; email: string; reason: string; campaign_id?: number; bcart_customer_id?: number }) {
  const email = s.email.toLowerCase()
  const existing = must(await db().from('mm_suppressions').select('id, bcart_synced_at').eq('tenant_id', s.tenant_id).eq('email', email).maybeSingle(), '停止リストの確認') as
    { id: number; bcart_synced_at: string | null } | null
  const row = existing ?? must(await db().from('mm_suppressions').insert({ ...s, email }).select('id, bcart_synced_at').single(), '停止リストへの登録') as
    { id: number; bcart_synced_at: string | null }
  if (s.reason !== 'bounced' && s.bcart_customer_id && !row.bcart_synced_at) await writeBackToBcart(row.id, s.bcart_customer_id)
}

async function writeBackToBcart(suppressionId: number, customerId: number) {
  try {
    await updateCustomerMmFlag(customerId, 0)
    await db().from('mm_suppressions').update({ bcart_synced_at: new Date().toISOString(), bcart_sync_error: null }).eq('id', suppressionId)
  } catch (e) {
    await db().from('mm_suppressions').update({ bcart_sync_error: e instanceof Error ? e.message : String(e) }).eq('id', suppressionId)
  }
}

export async function retryBcartWriteback() {
  const rows = must(await db().from('mm_suppressions').select('id, bcart_customer_id')
    .is('bcart_synced_at', null).not('bcart_customer_id', 'is', null).neq('reason', 'bounced').limit(50), '書き戻し対象の取得') as
    Array<{ id: number; bcart_customer_id: number }>
  for (const r of rows) await writeBackToBcart(r.id, r.bcart_customer_id)
  return rows.length
}

export async function listSuppressions() {
  const tenant_id = await mailTenantId()
  return must(await db().from('mm_suppressions').select('*').eq('tenant_id', tenant_id).order('created_at', { ascending: false }).limit(500), '停止リストの取得')
}

// ───────── Webhook ─────────

export interface ResendWebhookEvent {
  type: string
  created_at: string
  data: {
    email_id?: string
    tags?: Record<string, string> | Array<{ name: string; value: string }>
    click?: { link?: string }
    bounce?: { type?: string }
  }
}

function tagValue(tags: ResendWebhookEvent['data']['tags'], name: string): string | undefined {
  if (!tags) return undefined
  if (Array.isArray(tags)) return tags.find((t) => t.name === name)?.value
  return tags[name]
}

export async function handleWebhook(svixId: string, ev: ResendWebhookEvent) {
  const emailId = ev.data.email_id ?? null
  type Hit = { id: number; campaign_id: number; email: string; bcart_customer_id: number } | null
  let delivery: Hit = null
  if (emailId) {
    delivery = must(await db().from('mm_deliveries').select('id, campaign_id, email, bcart_customer_id').eq('resend_email_id', emailId).maybeSingle(), '宛先の特定') as Hit
  }
  if (!delivery) {
    const did = Number(tagValue(ev.data.tags, 'delivery_id'))
    if (did > 0) {
      delivery = must(await db().from('mm_deliveries').select('id, campaign_id, email, bcart_customer_id').eq('id', did).maybeSingle(), '宛先の特定') as Hit
    }
  }
  if (!delivery) return { ignored: true } // テスト配信や他システムのメール

  const ins = await db().from('mm_events').insert({
    svix_id: svixId,
    resend_email_id: emailId,
    delivery_id: delivery.id,
    campaign_id: delivery.campaign_id,
    type: ev.type,
    link_url: ev.data.click?.link ?? null,
    occurred_at: ev.created_at,
    payload: ev,
  })
  if (ins.error) {
    if (ins.error.code === '23505') return { duplicate: true } // 再送
    throw new MailError(`イベントの保存に失敗しました: ${ins.error.message}`, 500)
  }
  must(await db().rpc('mm_apply_event', { p_delivery_id: delivery.id, p_type: ev.type, p_at: ev.created_at }), 'イベントの反映')

  const tenant_id = await mailTenantId()
  if (ev.type === 'email.complained') {
    await addSuppression({ tenant_id, email: delivery.email, reason: 'complained', campaign_id: delivery.campaign_id, bcart_customer_id: delivery.bcart_customer_id })
  } else if (ev.type === 'email.bounced' && (ev.data.bounce?.type ?? 'Permanent') === 'Permanent') {
    await addSuppression({ tenant_id, email: delivery.email, reason: 'bounced', campaign_id: delivery.campaign_id, bcart_customer_id: delivery.bcart_customer_id })
  }
  return { ok: true }
}
