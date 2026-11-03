/**
 * Chatwork Webhook
 *   1. 見積書ルームのメッセージ作成イベント（ルームイベント message_created）→ 見積書PDFの取込
 *   2. 自分宛てメンション（アカウントイベント mention_created）→ LINE未対応の通知に「済」と返信されたら対応済にする
 *      通知はSFAの投稿アカウント（平岡）のトークンで投稿しているため、通知への返信は投稿アカウント宛てのメンションとして届く
 *   署名（x-chatworkwebhooksignature）を CHATWORK_WEBHOOK_TOKEN / CHATWORK_MENTION_WEBHOOK_TOKEN で検証する。
 *   Chatworkへは即200を返し、取込（ファイル取得・R2保存・通知）は after() で行う。
 */
import { after, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/sfa/chatwork'
import { handleChatworkDoneReply } from '@/lib/sfa/line'
import { ingestMessage } from '@/lib/sfa/quote-ingest'

export const maxDuration = 60

interface WebhookPayload {
  webhook_event_type: string
  webhook_event: { message_id: string; room_id: number; account_id?: number; from_account_id?: number; body: string }
}

export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifyWebhookSignature(raw, request.headers.get('x-chatworkwebhooksignature'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }
  const payload = JSON.parse(raw) as WebhookPayload
  const ev = payload.webhook_event

  if (payload.webhook_event_type === 'mention_created') {
    after(async () => {
      try {
        const done = await handleChatworkDoneReply({ room_id: String(ev.room_id), account_id: String(ev.from_account_id ?? ''), body: ev.body })
        if (done.length) console.log('[chatwork webhook] LINE対応済', JSON.stringify(done))
      } catch (e) {
        console.error('[chatwork webhook] 済返信の処理に失敗', e)
      }
    })
    return NextResponse.json({ ok: true })
  }

  if (!['message_created', 'message_updated'].includes(payload.webhook_event_type)) return NextResponse.json({ ok: true })

  after(async () => {
    try {
      // 見積書ルーム内での「済」返信（テスト運用中は通知が見積書ルームに集まるため、ここでも拾う）
      const done = await handleChatworkDoneReply({ room_id: String(ev.room_id), account_id: String(ev.account_id ?? ''), body: ev.body })
      if (done.length) { console.log('[chatwork webhook] LINE対応済', JSON.stringify(done)); return }
      const results = await ingestMessage({
        room_id: String(ev.room_id), message_id: String(ev.message_id), account_id: String(ev.account_id), body: ev.body,
      })
      if (results.length) console.log('[chatwork webhook]', JSON.stringify(results))
    } catch (e) {
      console.error('[chatwork webhook] 取込に失敗', e)
    }
  })
  return NextResponse.json({ ok: true })
}
