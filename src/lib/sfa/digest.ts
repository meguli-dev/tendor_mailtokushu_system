/**
 * 毎朝のまとめ通知（Chatwork）
 *   所属ごとに1通にまとめて、それぞれの通知ルームに送る
 *     テンドール（CHATWORK_TENDOR_ROOM_ID）: テンドールのメンバーが対応担当の案件
 *     外部営業  （CHATWORK_SALES_ROOM_ID） : 外部営業が対応担当・トスアップした案件
 *   テスト運用中（SFA_NOTIFY_TEST_MODE=1）は2通とも見積書ルームに送る
 *   中身: 件数サマリ / 今日架電 / 2日以上放置 / 追客推奨（いずれも対応担当ごと）
 */
import { notifyTestMode, postMessage, quoteRoomId } from './chatwork'
import { SFA_OWNER_TENANT_NAME, todayJst } from './constants'
import { dealUrl } from './notify'
import { listInbox } from './quote-ingest'
import { getTodayBoard, latestQuoteSummaries, listDeals, listMembers, type DealOverview } from './service'

/** 追客推奨にする段階（受注に近いのに次回が決まっていないものを拾う） */
const CHASE_STAGES = ['見積作成済', '検討中', '会員登録']

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const cut = (s: string | null | undefined, n: number) => {
  const t = (s || '').replace(/取込時に推定（?|）$/g, '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

/** 対応担当ごとにまとめる */
function byOwner(rows: DealOverview[], render: (d: DealOverview) => string, max: number): string {
  const groups = new Map<string, DealOverview[]>()
  for (const d of rows.slice(0, max)) {
    const k = d.owner_name ?? '未割当'
    groups.set(k, [...(groups.get(k) ?? []), d])
  }
  const more = rows.length > max ? `\n…ほか${rows.length - max}件` : ''
  return [...groups].map(([name, ds]) => `${name}さん\n${ds.map(render).join('\n')}`).join('\n\n') + more
}

/** quotes: 案件ごとの最新見積の要約（「KMスクエア 228 28円ほか2点 計32,100円」） */
const withSummary = (summary: (d: DealOverview) => string, quotes: Map<number, string>) => (d: DealOverview) => {
  const s = summary(d)
  const q = quotes.get(d.id)
  return `・${d.company_name}［${d.stage}］ ${dealUrl(d.id)}${s ? `\n　${s}` : ''}${q ? `\n　見積：${q}` : ''}`
}

const callSummary = (quotes: Map<number, string>) => withSummary((d) =>
  [d.next_kind && `${d.next_kind}${d.next_note ? `：${cut(d.next_note, 40)}` : ''}`, d.last_contact_body && `前回：${cut(d.last_contact_body, 60)}`]
    .filter(Boolean).join('／'), quotes)

const chaseSummary = (quotes: Map<number, string>) => withSummary((d) =>
  [d.answer_due ? `回答予定 ${md(d.answer_due)}` : '次回未設定', d.considering && `検討：${cut(d.considering, 40)}`,
    d.last_contact_body && `前回${d.last_contact_on ? ` ${md(d.last_contact_on)}` : ''}：${cut(d.last_contact_body, 50)}`]
    .filter(Boolean).join('／'), quotes)

const nameOnly = (d: DealOverview) => `・${d.company_name}［${d.stage}］${d.next_due_on ? ` ${md(d.next_due_on)}予定` : ''} ${dealUrl(d.id)}`

export async function buildDigest(side: 'tendor' | 'sales'): Promise<string> {
  const members = await listMembers()
  const isTendor = (name: string | null) => members.find((m) => m.name === name)?.tenant_name === SFA_OWNER_TENANT_NAME
  const mine = (d: DealOverview) =>
    side === 'tendor' ? isTendor(d.owner_name) : !isTendor(d.owner_name) || (!!d.tossed_by_name && !isTendor(d.tossed_by_name))

  const all = await getTodayBoard()
  const today = all.today
  const twoDaysAgo = new Date(Date.parse(todayJst()) - 2 * 86400_000).toISOString().slice(0, 10)
  const scoped = (await listDeals({ open: true })).filter(mine)
  const ids = new Set(scoped.map((d) => d.id))

  const overdue = all.overdue.filter((d) => ids.has(d.id))
  const dueToday = all.due_today.filter((d) => ids.has(d.id))
  const noNext = all.no_next.filter((d) => ids.has(d.id))
  const stale = overdue.filter((d) => d.next_due_on && d.next_due_on <= twoDaysAgo)
  const listed = new Set([...dueToday, ...stale].map((d) => d.id))
  const chase = scoped.filter((d) => !listed.has(d.id) && CHASE_STAGES.includes(d.stage) &&
    ((d.answer_due && d.answer_due <= today) || !d.next_due_on))
    .sort((a, b) => (a.answer_due || '9999').localeCompare(b.answer_due || '9999'))

  const queue = all.quote_queue.filter((q) => ids.has(q.deal_id))
  const inbox = side === 'tendor' ? ((await listInbox())?.length ?? 0) : 0
  const quotes = await latestQuoteSummaries([...dueToday, ...chase].map((d) => d.id))

  const parts = [
    `[info][title]${md(today)} SFA全体（${side === 'tendor' ? 'テンドール' : '外部営業'}）[/title]`,
    `進行中 ${scoped.length}件 ／ 期限切れ ${overdue.length}件 ／ 今日架電 ${dueToday.length}件 ／ 次回未設定 ${noNext.length}件`,
    `見積作成待ち ${queue.filter((q) => q.status !== '作成中').length}件 ／ 見積作成中 ${queue.filter((q) => q.status === '作成中').length}件 ／ 見積提示待ち ${scoped.filter((d) => d.stage === '見積作成済').length}件${inbox ? ` ／ 仕分け待ち ${inbox}件` : ''}`,
    `検討中 ${scoped.filter((d) => d.stage === '検討中').length}件`,
    dueToday.length ? `\n■今日架電案件（${dueToday.length}件）\n${byOwner(dueToday, callSummary(quotes), 30)}` : '',
    stale.length ? `\n■2日以上放置されている案件（${stale.length}件）\n${byOwner(stale, nameOnly, 30)}` : '',
    chase.length ? `\n▽追客推奨（${chase.length}件）\n${byOwner(chase, chaseSummary(quotes), 15)}` : '',
    '[/info]',
  ]
  return parts.filter(Boolean).join('\n')
}

export async function sendDailyDigests() {
  const sent: string[] = []
  const test = notifyTestMode()
  const targets = [
    ['tendor', test ? quoteRoomId() : process.env.CHATWORK_TENDOR_ROOM_ID],
    ['sales', test ? quoteRoomId() : process.env.CHATWORK_SALES_ROOM_ID],
  ] as const
  for (const [side, room] of targets) {
    if (!room) continue
    await postMessage(room, await buildDigest(side))
    sent.push(side)
  }
  return { sent }
}
