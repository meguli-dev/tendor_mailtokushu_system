/**
 * 毎朝のまとめ通知（Chatwork）
 *   各メンバー: 自分が対応担当の「期限切れ / 今日 / 次回未設定 / 今日が回答予定」
 *   全体ルーム（CHATWORK_NOTIFY_ROOM_ID）: 2日以上の期限切れ・見積作成待ち・仕分け待ちの件数
 */
import { postMessage } from './chatwork'
import { todayJst } from './constants'
import { dealUrl, sendToMember } from './notify'
import { listInbox } from './quote-ingest'
import { getTodayBoard, listMembers, type DealOverview, type TodayBoard } from './service'

const line = (d: DealOverview) =>
  `・${d.company_name}［${d.stage}］${d.next_due_on ? `${d.next_due_on.slice(5).replace('-', '/')} ${d.next_kind ?? ''}` : ''}${d.next_note ? `：${d.next_note.slice(0, 40)}` : ''}\n  ${dealUrl(d.id)}`

function section(title: string, rows: DealOverview[], max = 15) {
  if (!rows.length) return ''
  const more = rows.length > max ? `\n…ほか${rows.length - max}件` : ''
  return `■${title}（${rows.length}件）\n${rows.slice(0, max).map(line).join('\n')}${more}`
}

export function memberDigest(name: string, b: TodayBoard): string | null {
  const answerToday = b.answer_waiting.filter((d) => d.answer_due && d.answer_due <= b.today)
  const parts = [
    section('期限切れ（未対応）', b.overdue),
    section('今日やること', b.due_today),
    section('回答予定日が今日まで', answerToday.filter((d) => !b.overdue.includes(d) && !b.due_today.includes(d))),
    section('次回予定が未設定', b.no_next, 10),
  ].filter(Boolean)
  if (!parts.length) return null
  return `[info][title]${b.today.slice(5).replace('-', '/')} ${name}さんの今日のSFA[/title]${parts.join('\n\n')}[/info]`
}

export async function sendDailyDigests() {
  const members = (await listMembers()).filter((m) => m.active && (m.chatwork_room_id || m.chatwork_account_id))
  const sent: string[] = []
  for (const m of members) {
    const board = await getTodayBoard({ ownerId: m.id })
    const body = memberDigest(m.name, board)
    if (body && (await sendToMember(m, body))) sent.push(m.name)
  }

  const room = process.env.CHATWORK_NOTIFY_ROOM_ID
  if (room) {
    const all = await getTodayBoard()
    const twoDaysAgo = new Date(Date.parse(todayJst()) - 2 * 86400_000).toISOString().slice(0, 10)
    const stale = all.overdue.filter((d) => d.next_due_on && d.next_due_on <= twoDaysAgo)
    const inbox = await listInbox()
    const summary = [
      `[info][title]${all.today.slice(5).replace('-', '/')} SFA全体[/title]`,
      `進行中 ${all.counts.open}件 ／ 期限切れ ${all.overdue.length}件 ／ 今日 ${all.due_today.length}件 ／ 次回未設定 ${all.no_next.length}件`,
      `見積作成待ち ${all.quote_queue.length}件 ／ 仕分け待ち ${inbox?.length ?? 0}件`,
      stale.length ? `\n${section('2日以上放置されている案件', stale, 20)}` : '',
      '[/info]',
    ].filter(Boolean).join('\n')
    await postMessage(room, summary)
    sent.push('全体')
  }
  return { sent }
}
