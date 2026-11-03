/**
 * SFA × LINE公式アカウント（容器なび 顧客サポート）
 *   LINE_CHANNEL_SECRET       : Webhookの署名検証
 *   LINE_CHANNEL_ACCESS_TOKEN : プロフィール取得（表示名・アイコン）のみに使う
 *
 * SFAからLINEへメッセージは一切送らない（返信は公式アカウントのチャット画面で行う。push扱いの通数を消費しないため）。
 * SFAがやるのは
 *   1. 友だち・受信メッセージの記録
 *   2. 案件への紐付け（管理画面・MCP。自動応答で店舗名は聞かない）
 *   3. 未対応の管理（受信で未対応 → Chatwork通知 → 2時間後に再通知 → 終業時にまとめ → 朝まとめの先頭。担当者が「対応済」にするまで残る）
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { chatworkConfigured, notifyTestMode, postMessage, quoteRoomId, to } from './chatwork'
import type { SfaMember } from './member'
import { appUrl, dealUrl, sideRoom } from './notify'
import { addActivity, SfaError } from './service'

const db = () => createAdminClient()

function must(res: { data: unknown; error: { message: string } | null }, what = '処理'): unknown {
  if (res.error) throw new SfaError(`${what}に失敗しました: ${res.error.message}`, 500)
  return res.data
}

/** 友だち追加URL（公式アカウント @068yrczd） */
export const LINE_BASIC_ID = process.env.LINE_BASIC_ID || '@068yrczd'
export const lineFriendUrl = () => `https://line.me/R/ti/p/${LINE_BASIC_ID}`

/** 再通知までの時間・再通知する時間帯（JST） */
export const LINE_REMIND_AFTER_MIN = 120
const REMIND_HOURS_JST = { from: 9, to: 19 }

// =============================================================
// LINE API
// =============================================================
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

interface LineProfile { displayName: string; pictureUrl?: string; statusMessage?: string }

async function getProfile(userId: string): Promise<LineProfile | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return null
  const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return (await res.json()) as LineProfile
}

// =============================================================
// Webhook イベントの処理
// =============================================================
export interface LineEvent {
  type: string
  webhookEventId?: string
  timestamp: number
  mode?: string
  source?: { type: string; userId?: string }
  message?: { id: string; type: string; text?: string; fileName?: string; packageId?: string; stickerId?: string; title?: string; address?: string }
  deliveryContext?: { isRedelivery?: boolean }
}

interface LineUserRow {
  id: number
  line_user_id: string
  display_name: string | null
  picture_url: string | null
  is_friend: boolean
  followed_at: string | null
  deal_id: number | null
  last_message_at: string | null
  last_message_text: string | null
  pending_since: string | null
  notified_at: string | null
  notify_count: number
  notify_message_id: string | null
}

const USER_COLUMNS = 'id, line_user_id, display_name, picture_url, is_friend, followed_at, deal_id, last_message_at, last_message_text, pending_since, notified_at, notify_count, notify_message_id'

async function upsertUser(userId: string, patch: Record<string, unknown>, refreshProfile: boolean): Promise<LineUserRow> {
  const existing = must(await db().from('sfa_line_users').select(USER_COLUMNS).eq('line_user_id', userId).maybeSingle(), 'LINE友だち取得') as LineUserRow | null
  const profile = refreshProfile || !existing?.display_name ? await getProfile(userId) : null
  const prof = profile ? { display_name: profile.displayName, picture_url: profile.pictureUrl ?? null, status_message: profile.statusMessage ?? null } : {}
  if (existing) {
    const row = must(await db().from('sfa_line_users').update({ ...prof, ...patch }).eq('id', existing.id).select(USER_COLUMNS).single(), 'LINE友だち更新')
    return row as LineUserRow
  }
  const row = must(await db().from('sfa_line_users').insert({ line_user_id: userId, ...prof, ...patch }).select(USER_COLUMNS).single(), 'LINE友だち登録')
  return row as LineUserRow
}

function messageText(m: NonNullable<LineEvent['message']>): string {
  switch (m.type) {
    case 'text': return m.text ?? ''
    case 'image': return '[画像]'
    case 'video': return '[動画]'
    case 'audio': return '[音声]'
    case 'file': return `[ファイル] ${m.fileName ?? ''}`.trim()
    case 'sticker': return '[スタンプ]'
    case 'location': return `[位置情報] ${m.title ?? m.address ?? ''}`.trim()
    default: return `[${m.type}]`
  }
}

export interface LineEventResult { type: string; user?: number; notified?: boolean; skipped?: string }

export async function handleLineEvents(events: LineEvent[]): Promise<LineEventResult[]> {
  const results: LineEventResult[] = []
  for (const ev of events) {
    const userId = ev.source?.type === 'user' ? ev.source.userId : undefined
    if (!userId) { results.push({ type: ev.type, skipped: 'ユーザー以外（グループ等）' }); continue }
    const at = new Date(ev.timestamp).toISOString()

    if (ev.type === 'follow') {
      const u = await upsertUser(userId, { is_friend: true, followed_at: at, unfollowed_at: null }, true)
      results.push({ type: ev.type, user: u.id })
      continue
    }
    if (ev.type === 'unfollow') {
      const u = await upsertUser(userId, { is_friend: false, unfollowed_at: at }, false)
      results.push({ type: ev.type, user: u.id })
      continue
    }
    if (ev.type === 'message' && ev.message) {
      // 再送分は二重登録しない
      const dup = must(await db().from('sfa_line_messages').select('id').eq('line_message_id', ev.message.id).maybeSingle(), 'LINEメッセージ確認')
      if (dup) { results.push({ type: ev.type, skipped: '登録済み' }); continue }
      const text = messageText(ev.message)
      const before = must(await db().from('sfa_line_users').select(USER_COLUMNS).eq('line_user_id', userId).maybeSingle(), 'LINE友だち取得') as LineUserRow | null
      const u = await upsertUser(userId, {
        is_friend: true,
        ...(before?.followed_at ? {} : { followed_at: at }),
        last_message_at: at, last_message_text: text.slice(0, 500),
        // 未対応の開始時刻は最初の未返信メッセージのまま
        ...(before?.pending_since ? {} : { pending_since: at, notify_count: 0, notified_at: null, notify_message_id: null }),
      }, false)
      must(await db().from('sfa_line_messages').insert({
        line_user_id: u.id, line_message_id: ev.message.id, webhook_event_id: ev.webhookEventId ?? null,
        type: ev.message.type, text, sent_at: at, raw: ev,
      }), 'LINEメッセージ登録')
      // 通知は「未対応になった瞬間」だけ。続けて届いたメッセージは再通知（cron）に任せる
      let notified = false
      if (!before?.pending_since) notified = await notifyPending(u, 'new').catch((e) => { console.error('[line notify]', e); return false })
      results.push({ type: ev.type, user: u.id, notified })
      continue
    }
    results.push({ type: ev.type, skipped: '対象外のイベント' })
  }
  return results
}

// =============================================================
// 案件の候補（未紐付けの友だち用）
//   1. SMS招待の時刻: 招待から友だち追加までが短いほど高い（24時間以内）
//   2. LINE表示名・メッセージに店舗名／先方担当者名が含まれる
// =============================================================
export interface LineCandidate { deal_id: number; company_name: string; owner_name: string | null; score: number; reason: string }

const norm = (s: string | null | undefined) => (s || '').normalize('NFKC').toLowerCase().replace(/[\s　・\-‐ー（）()「」【】.,、。!！?？]/g, '')

async function candidatesFor(u: Pick<LineUserRow, 'id' | 'display_name' | 'followed_at'>, texts: string[]): Promise<LineCandidate[]> {
  const scores = new Map<number, { score: number; reasons: string[] }>()
  const add = (dealId: number, score: number, reason: string) => {
    const s = scores.get(dealId) ?? { score: 0, reasons: [] }
    s.score = Math.max(s.score, score) + (s.score ? 0.1 : 0)
    s.reasons.push(reason)
    scores.set(dealId, s)
  }

  if (u.followed_at) {
    const followed = Date.parse(u.followed_at)
    const since = new Date(followed - 24 * 3600_000).toISOString()
    const invites = must(await db().from('sfa_line_invites').select('deal_id, created_at')
      .gte('created_at', since).lte('created_at', new Date(followed + 5 * 60_000).toISOString())
      .order('created_at', { ascending: false }).limit(20), '招待取得') as Array<{ deal_id: number; created_at: string }>
    for (const inv of invites) {
      const min = Math.max(0, Math.round((followed - Date.parse(inv.created_at)) / 60_000))
      const score = min <= 10 ? 0.9 : min <= 60 ? 0.75 : min <= 180 ? 0.55 : 0.35
      add(inv.deal_id, score, `SMS招待の${min < 60 ? `${min}分` : `${Math.round(min / 60)}時間`}後に友だち追加`)
    }
  }

  const hay = [u.display_name, ...texts].map(norm).filter((s) => s.length >= 2)
  if (hay.length) {
    const deals = must(await db().from('sfa_deal_overview').select('id, company_name, contact_name')
      .eq('is_open', true).limit(1000), '案件取得') as Array<{ id: number; company_name: string; contact_name: string | null }>
    for (const d of deals) {
      const company = norm(d.company_name)
      const contact = norm(d.contact_name)
      if (company.length >= 2 && hay.some((h) => h.includes(company) || (h.length >= 3 && company.includes(h)))) add(d.id, 0.7, '店舗名が一致')
      else if (contact.length >= 2 && hay.some((h) => h.includes(contact) || (h.length >= 2 && contact === h))) add(d.id, 0.5, '担当者名が一致')
    }
  }

  if (!scores.size) return []
  const ids = [...scores.keys()]
  const info = must(await db().from('sfa_deal_overview').select('id, company_name, owner_name').in('id', ids), '案件取得') as
    Array<{ id: number; company_name: string; owner_name: string | null }>
  return info.map((d) => {
    const s = scores.get(d.id)!
    return { deal_id: d.id, company_name: d.company_name, owner_name: d.owner_name, score: Math.min(0.99, Math.round(s.score * 100) / 100), reason: s.reasons.join('・') }
  }).sort((a, b) => b.score - a.score).slice(0, 5)
}

// =============================================================
// 一覧
// =============================================================
export interface LineUserView {
  id: number
  display_name: string | null
  picture_url: string | null
  is_friend: boolean
  followed_at: string | null
  last_message_at: string | null
  last_message_text: string | null
  pending_since: string | null
  pending_minutes: number | null
  deal_id: number | null
  company_name?: string | null
  owner_name?: string | null
  messages?: Array<{ type: string; text: string | null; sent_at: string }>
  candidates?: LineCandidate[]
}

async function recentMessages(userIds: number[], perUser = 5) {
  if (!userIds.length) return new Map<number, Array<{ type: string; text: string | null; sent_at: string }>>()
  const rows = must(await db().from('sfa_line_messages').select('line_user_id, type, text, sent_at')
    .in('line_user_id', userIds).order('sent_at', { ascending: false }).limit(userIds.length * perUser * 2), 'LINEメッセージ取得') as
    Array<{ line_user_id: number; type: string; text: string | null; sent_at: string }>
  const map = new Map<number, Array<{ type: string; text: string | null; sent_at: string }>>()
  for (const r of rows) {
    const list = map.get(r.line_user_id) ?? []
    if (list.length < perUser) list.push({ type: r.type, text: r.text, sent_at: r.sent_at })
    map.set(r.line_user_id, list)
  }
  return map
}

const minutesSince = (iso: string | null) => (iso ? Math.round((Date.now() - Date.parse(iso)) / 60_000) : null)

function view(u: LineUserRow & { deal?: { company?: { name: string } | null; owner?: { name: string } | null } | null }): LineUserView {
  return {
    id: u.id, display_name: u.display_name, picture_url: u.picture_url, is_friend: u.is_friend, followed_at: u.followed_at,
    last_message_at: u.last_message_at, last_message_text: u.last_message_text,
    pending_since: u.pending_since, pending_minutes: minutesSince(u.pending_since),
    deal_id: u.deal_id, company_name: u.deal?.company?.name ?? null, owner_name: u.deal?.owner?.name ?? null,
  }
}

const WITH_DEAL = `${USER_COLUMNS}, deal:sfa_deals(company:sfa_companies(name), owner:sfa_members!sfa_deals_owner_id_fkey(name))`

/** 案件に紐付いていない友だち（候補付き） */
export async function listUnlinkedLineUsers(opts: { includeBlocked?: boolean } = {}): Promise<LineUserView[]> {
  let q = db().from('sfa_line_users').select(USER_COLUMNS).is('deal_id', null)
  if (!opts.includeBlocked) q = q.eq('is_friend', true)
  const rows = must(await q.order('pending_since', { ascending: true, nullsFirst: false }).order('followed_at', { ascending: false }).limit(200), '未紐付け取得') as LineUserRow[]
  const msgs = await recentMessages(rows.map((r) => r.id))
  return Promise.all(rows.map(async (r) => {
    const messages = msgs.get(r.id) ?? []
    return { ...view(r), messages, candidates: await candidatesFor(r, messages.map((m) => m.text || '')) }
  }))
}

/** 未対応（受信して、まだ対応済にしていない）。経過時間の長い順 */
export async function listPendingLineUsers(opts: { ownerId?: number } = {}): Promise<LineUserView[]> {
  const rows = must(await db().from('sfa_line_users').select(WITH_DEAL).not('pending_since', 'is', null)
    .order('pending_since', { ascending: true }).limit(200), '未対応取得') as Array<LineUserRow & { deal: { company: { name: string } | null; owner: { name: string } | null } | null }>
  let list = rows
  if (opts.ownerId) {
    const dealIds = must(await db().from('sfa_deals').select('id').eq('owner_id', opts.ownerId), '案件取得') as Array<{ id: number }>
    const mine = new Set(dealIds.map((d) => d.id))
    list = rows.filter((r) => r.deal_id && mine.has(r.deal_id))
  }
  const msgs = await recentMessages(list.map((r) => r.id), 3)
  return list.map((r) => ({ ...view(r), messages: msgs.get(r.id) ?? [] }))
}

/** 案件に紐付いているLINE（案件詳細用） */
export async function getDealLine(dealId: number) {
  const rows = must(await db().from('sfa_line_users').select(USER_COLUMNS).eq('deal_id', dealId).order('followed_at'), 'LINE取得') as LineUserRow[]
  const msgs = await recentMessages(rows.map((r) => r.id), 30)
  const invites = must(await db().from('sfa_line_invites').select('id, created_at, phone, member:sfa_members(name)')
    .eq('deal_id', dealId).order('created_at', { ascending: false }).limit(10), '招待取得')
  return { users: rows.map((r) => ({ ...view(r), messages: msgs.get(r.id) ?? [] })), invites, friend_url: lineFriendUrl() }
}

// =============================================================
// 操作
// =============================================================
async function getUser(id: number): Promise<LineUserRow> {
  const u = must(await db().from('sfa_line_users').select(USER_COLUMNS).eq('id', id).maybeSingle(), 'LINE友だち取得') as LineUserRow | null
  if (!u) throw new SfaError('LINEの友だちが見つかりません', 404)
  return u
}

export async function linkLineUser(member: SfaMember, lineUserId: number, dealId: number, note: string | null | undefined, source: 'ui' | 'mcp' = 'ui') {
  const u = await getUser(lineUserId)
  const deal = must(await db().from('sfa_deals').select('id').eq('id', dealId).maybeSingle(), '案件取得')
  if (!deal) throw new SfaError('案件が見つかりません', 404)
  must(await db().from('sfa_line_users').update({
    deal_id: dealId, linked_at: new Date().toISOString(), linked_by_id: member.id, link_note: note?.trim() || null,
  }).eq('id', u.id), 'LINE紐付け')
  await addActivity(dealId, member, 'メモ', `LINE友だち「${u.display_name ?? '名前不明'}」を紐付け${note?.trim() ? `（${note.trim()}）` : ''}`, { source })
  return { line_user_id: u.id, deal_id: dealId }
}

export async function unlinkLineUser(member: SfaMember, lineUserId: number, source: 'ui' | 'mcp' = 'ui') {
  const u = await getUser(lineUserId)
  if (!u.deal_id) return { line_user_id: u.id, deal_id: null }
  must(await db().from('sfa_line_users').update({ deal_id: null, linked_at: null, linked_by_id: null, link_note: null }).eq('id', u.id), 'LINE紐付け解除')
  await addActivity(u.deal_id, member, 'メモ', `LINE友だち「${u.display_name ?? '名前不明'}」の紐付けを解除`, { source })
  return { line_user_id: u.id, deal_id: null }
}

/** 対応済にする（返信したことの自己申告）。memo があれば案件の履歴に残す */
export async function markLineHandled(member: SfaMember | null, lineUserId: number, opts: { memo?: string | null; source?: 'ui' | 'mcp' | 'system' } = {}) {
  const u = await getUser(lineUserId)
  if (!u.pending_since) return { line_user_id: u.id, already: true }
  must(await db().from('sfa_line_users').update({
    pending_since: null, handled_at: new Date().toISOString(), handled_by_id: member?.id ?? null,
  }).eq('id', u.id), '対応済の登録')
  if (u.deal_id && opts.memo?.trim()) {
    await addActivity(u.deal_id, member, 'メモ', `LINE対応：${opts.memo.trim()}`, { source: opts.source ?? 'ui' })
  }
  return { line_user_id: u.id, already: false }
}

/** SMS招待の文面と友だち追加URL。送った記録を残し、友だち追加時の紐付け候補に使う */
export async function createLineInvite(member: SfaMember, dealId: number, phone?: string | null) {
  const deal = must(await db().from('sfa_deals').select('id, company:sfa_companies(name)').eq('id', dealId).maybeSingle(), '案件取得') as
    { id: number; company: { name: string } | null } | null
  if (!deal) throw new SfaError('案件が見つかりません', 404)
  must(await db().from('sfa_line_invites').insert({ deal_id: dealId, member_id: member.id, phone: phone || null }), '招待の記録')
  const url = lineFriendUrl()
  const text = `容器なびの${member.name}です。先ほどはありがとうございました。\nお見積りやご相談はこちらのLINEからお気軽にどうぞ。\n${url}`
  const tel = (phone || '').replace(/[^0-9+]/g, '')
  return { url, text, sms_href: tel ? `sms:${tel}?body=${encodeURIComponent(text)}` : null }
}

// =============================================================
// Chatwork通知
//   宛先: 紐付け済 → 対応担当（個別ルーム or 所属側ルーム） / 未紐付け → テンドールの通知ルーム
//   テスト運用中（SFA_NOTIFY_TEST_MODE=1）はすべて見積書ルーム
// =============================================================
interface OwnerCtx { name: string; chatwork_account_id: string | null; chatwork_room_id: string | null; tenant: { name: string } | null }

async function ownerOf(dealId: number | null): Promise<{ company: string | null; owner: OwnerCtx | null }> {
  if (!dealId) return { company: null, owner: null }
  const d = must(await db().from('sfa_deals').select(`company:sfa_companies(name),
    owner:sfa_members!sfa_deals_owner_id_fkey(name, chatwork_account_id, chatwork_room_id, tenant:tenants(name))`).eq('id', dealId).maybeSingle(), '案件取得') as
    { company: { name: string } | null; owner: OwnerCtx | null } | null
  return { company: d?.company?.name ?? null, owner: d?.owner ?? null }
}

const lineUrl = () => `${appUrl()}/sfa/line`
const elapsed = (min: number | null) => (min == null ? '' : min < 60 ? `${min}分` : `${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ''}`)

/** 未対応通知の本文（DBに触れない。送信テストからも使う） */
export function pendingMessageBody(
  u: Pick<LineUserRow, 'deal_id' | 'display_name' | 'last_message_text' | 'pending_since'>,
  company: string | null, owner: Pick<OwnerCtx, 'name' | 'chatwork_account_id'> | null, kind: 'new' | 'remind',
): string {
  const who = u.display_name ?? '名前不明'
  const head = kind === 'new' ? 'LINEにメッセージが届きました' : `LINE未対応（${elapsed(minutesSince(u.pending_since))}経過）`
  return u.deal_id ? [
    to(owner?.chatwork_account_id, owner?.name),
    `[info][title]${head}：${company ?? ''} 様（LINE：${who}）[/title]`,
    `「${(u.last_message_text ?? '').slice(0, 300)}」`,
    `\n返信はLINE公式アカウントのチャットから。返信したら、このメッセージに「済」と返信するか、SFAで「対応済」を押してください。`,
    `案件：${dealUrl(u.deal_id)}[/info]`,
  ].join('\n') : [
    `[info][title]${head}（案件未紐付け）：LINE「${who}」さん[/title]`,
    `「${(u.last_message_text ?? '').slice(0, 300)}」`,
    `\nどの案件のお客様か分かる方は、SFAで案件に紐付けてください：${lineUrl()}`,
    `返信したら、このメッセージに「済」と返信するか、SFAで「対応済」を押してください。[/info]`,
  ].join('\n')
}

async function notifyPending(u: LineUserRow, kind: 'new' | 'remind'): Promise<boolean> {
  if (!chatworkConfigured()) return false
  const { company, owner } = await ownerOf(u.deal_id)
  const room = notifyTestMode() ? quoteRoomId() : u.deal_id ? owner?.chatwork_room_id || sideRoom(owner?.tenant?.name) : process.env.CHATWORK_TENDOR_ROOM_ID
  if (!room) return false
  const messageId = await postMessage(room, pendingMessageBody(u, company, owner, kind))
  must(await db().from('sfa_line_users').update({
    notified_at: new Date().toISOString(), notify_count: u.notify_count + 1, notify_message_id: messageId,
  }).eq('id', u.id), '通知の記録')
  return true
}

/** 2時間以上未対応で、まだ再通知していないものを再通知する（営業時間内のみ） */
export async function remindPendingLine(): Promise<{ reminded: number[]; skipped?: string }> {
  const hour = new Date(Date.now() + 9 * 3600_000).getUTCHours()
  if (hour < REMIND_HOURS_JST.from || hour >= REMIND_HOURS_JST.to) return { reminded: [], skipped: '営業時間外' }
  const border = new Date(Date.now() - LINE_REMIND_AFTER_MIN * 60_000).toISOString()
  const rows = must(await db().from('sfa_line_users').select(USER_COLUMNS).not('pending_since', 'is', null)
    .lte('pending_since', border).lte('notify_count', 1), '未対応取得') as LineUserRow[]
  const reminded: number[] = []
  for (const u of rows) {
    // 初回通知が営業時間外で未送信（notify_count=0）のものもここで拾う
    if (u.notified_at && Date.parse(u.notified_at) > Date.parse(border)) continue
    if (await notifyPending(u, 'remind').catch((e) => { console.error('[line remind]', e); return false })) reminded.push(u.id)
  }
  return { reminded }
}

/** 終業時のまとめ（チーム全体）。未対応が無ければ送らない */
export async function buildLinePendingSummary(title: string): Promise<string | null> {
  const list = await listPendingLineUsers()
  return list.length ? pendingSummaryBody(list, title) : null
}

export function pendingSummaryBody(list: LineUserView[], title: string): string {
  const lines = list.map((u) => `・${u.company_name ? `${u.company_name} 様` : '（未紐付け）'}　LINE：${u.display_name ?? '名前不明'}　${elapsed(u.pending_minutes)}経過${u.owner_name ? `　担当：${u.owner_name}` : ''}\n　「${(u.last_message_text ?? '').replace(/\s+/g, ' ').slice(0, 60)}」${u.deal_id ? `\n　${dealUrl(u.deal_id)}` : ''}`)
  return [`[info][title]${title}（${list.length}件）[/title]`, ...lines, `\n一覧：${lineUrl()}[/info]`].join('\n')
}

export async function sendLineEndOfDay(): Promise<{ sent: boolean; count?: number }> {
  if (!chatworkConfigured()) return { sent: false }
  const room = notifyTestMode() ? quoteRoomId() : process.env.CHATWORK_TENDOR_ROOM_ID
  if (!room) return { sent: false }
  const body = await buildLinePendingSummary('本日のLINE未対応')
  if (!body) return { sent: false, count: 0 }
  await postMessage(room, body)
  return { sent: true }
}

/**
 * Chatworkで通知に「済」と返信されたら対応済にする
 *   [rp aid=... to=ROOM-MESSAGE_ID] を含み、本文が「済」「対応済」「返信済」等のメッセージ
 */
/** 返信先のメッセージID（「済」返信でなければ空） */
export function doneReplyRefs(body: string): string[] {
  const refs = [...body.matchAll(/\[rp aid=\d+ to=\d+-(\d+)\]/g)].map((m) => m[1])
  if (!refs.length) return []
  // 返信タグ・宛先タグの後ろには「◯◯さん」が付くので行ごと落とす
  const text = body.replace(/\[(rp|To:)[^\]]*\][^\n]*/g, '').replace(/\[[^\]]*\]/g, '').trim()
  return /^(済|済み|対応済|対応済み|返信済|返信済み|done|ok)[!！。.\s]*$/i.test(text) ? refs : []
}

export async function handleChatworkDoneReply(input: { room_id: string; account_id: string; body: string }): Promise<number[]> {
  const refs = doneReplyRefs(input.body)
  if (!refs.length) return []
  const users = must(await db().from('sfa_line_users').select('id').in('notify_message_id', refs).not('pending_since', 'is', null), '未対応取得') as Array<{ id: number }>
  if (!users.length) return []
  const member = must(await db().from('sfa_members').select('id, name, tenant_id, role, email, auth_user_id, chatwork_account_id, chatwork_room_id, active')
    .eq('chatwork_account_id', input.account_id).eq('active', true).maybeSingle(), 'メンバー取得') as SfaMember | null
  for (const u of users) await markLineHandled(member, u.id, { source: 'system' })
  return users.map((u) => u.id)
}
