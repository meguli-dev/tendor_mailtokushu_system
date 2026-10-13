/**
 * SFAのChatwork通知
 *   見積作成依頼・修正依頼 → 見積書専用ルーム（テンドールのメンバーにTo）
 *   見積書受領            → 対応担当の個別ルーム（未設定なら CHATWORK_NOTIFY_ROOM_ID）
 *   毎朝のまとめ          → 各メンバーの個別ルーム
 * トークン未設定時は何もしない（null を返す）。通知の失敗で業務処理を止めない。
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { chatworkConfigured, postMessage, quoteRoomId, to, uploadFile } from './chatwork'
import { SFA_OWNER_TENANT_NAME } from './constants'
import type { SfaMember } from './member'

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://tendor-mailtokushu-system.vercel.app').replace(/\/$/, '')
export const dealUrl = (dealId: number) => `${appUrl()}/sfa/deals/${dealId}`

interface QuoteCtx {
  id: number
  deal_id: number
  request_note: string | null
  due_on: string | null
  deal: {
    current_containers_text: string | null
    company: { name: string } | null
    owner: { id: number; name: string; chatwork_account_id: string | null; chatwork_room_id: string | null } | null
  }
}

/** 見積を作る側（テンドール）のメンバーへの宛先タグ */
async function quoteMakersTo(): Promise<string> {
  const db = createAdminClient()
  const { data } = await db.from('sfa_members').select('name, chatwork_account_id, tenant:tenants!inner(name)')
    .eq('active', true).eq('tenant.name', SFA_OWNER_TENANT_NAME).not('chatwork_account_id', 'is', null)
  return (data || []).map((m) => to(m.chatwork_account_id as string, m.name as string)).join('')
}

export async function notifyQuoteRequest(ctx: QuoteCtx, requester: SfaMember): Promise<string | null> {
  if (!chatworkConfigured() || !quoteRoomId()) return null
  const name = ctx.deal.company?.name ?? ''
  const body = [
    await quoteMakersTo(),
    `[info][title]【見積作成依頼 #Q-${ctx.id}】${name} 様[/title]`,
    `依頼者：${requester.name}　対応担当：${ctx.deal.owner?.name ?? '未割当'}${ctx.due_on ? `　回答希望：${ctx.due_on}` : ''}`,
    ctx.request_note ? `\n■依頼内容\n${ctx.request_note}` : '',
    ctx.deal.current_containers_text ? `\n■使用中容器\n${ctx.deal.current_containers_text.slice(0, 800)}` : '',
    `\n案件：${dealUrl(ctx.deal_id)}[/info]`,
    '見積書PDFはこのルームに投稿してください（ファイル名に店舗名を入れてください）。',
  ].filter(Boolean).join('\n')
  return postMessage(quoteRoomId(), body)
}

export async function notifyRevisionRequest(
  ctx: QuoteCtx, requester: SfaMember, note: string,
  attachment: { buffer: Buffer; file_name: string; mime_type: string } | null,
): Promise<string | null> {
  if (!chatworkConfigured() || !quoteRoomId()) return null
  const name = ctx.deal.company?.name ?? ''
  const body = [
    await quoteMakersTo(),
    `[info][title]【修正依頼 #Q-${ctx.id}】${name} 様[/title]`,
    `依頼者：${requester.name}`,
    `■修正内容\n${note}`,
    attachment ? '（参考ファイルを添付しています。見積書ではありません）' : '',
    `\n案件：${dealUrl(ctx.deal_id)}[/info]`,
    '修正版の見積書PDFをこのルームに投稿してください。',
  ].filter(Boolean).join('\n')
  if (attachment) return uploadFile(quoteRoomId(), attachment, body)
  return postMessage(quoteRoomId(), body)
}

export async function notifyQuoteReady(ctx: QuoteCtx, version: number): Promise<string | null> {
  if (!chatworkConfigured()) return null
  const owner = ctx.deal.owner
  const room = owner?.chatwork_room_id || process.env.CHATWORK_NOTIFY_ROOM_ID
  if (!room) return null
  const body = [
    to(owner?.chatwork_account_id, owner?.name),
    `[info][title]見積書が届きました：${ctx.deal.company?.name ?? ''} 様（第${version}版・#Q-${ctx.id}）[/title]`,
    'お客様に提示したら、SFAで「見積提示」を記録し、回答予定日を登録してください。',
    `案件：${dealUrl(ctx.deal_id)}[/info]`,
  ].join('\n')
  return postMessage(room, body)
}

export async function sendToMember(member: Pick<SfaMember, 'name' | 'chatwork_account_id' | 'chatwork_room_id'>, body: string): Promise<string | null> {
  if (!chatworkConfigured()) return null
  const room = member.chatwork_room_id || process.env.CHATWORK_NOTIFY_ROOM_ID
  if (!room) return null
  return postMessage(room, `${to(member.chatwork_account_id, member.name)}${body}`)
}
