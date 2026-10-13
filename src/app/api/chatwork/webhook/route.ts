/**
 * Chatwork Webhook（見積書ルームのメッセージ作成イベント）
 *   Chatworkの「Webhook設定」でルームイベント（message_created）を登録し、URLをここに向ける。
 *   署名（x-chatworkwebhooksignature）を CHATWORK_WEBHOOK_TOKEN で検証する。
 *   Chatworkへは即200を返し、取込（ファイル取得・R2保存・通知）は after() で行う。
 */
import { after, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/sfa/chatwork'
import { ingestMessage } from '@/lib/sfa/quote-ingest'

export const maxDuration = 60

interface WebhookPayload {
  webhook_event_type: string
  webhook_event: { message_id: string; room_id: number; account_id: number; body: string }
}

export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifyWebhookSignature(raw, request.headers.get('x-chatworkwebhooksignature'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }
  const payload = JSON.parse(raw) as WebhookPayload
  if (!['message_created', 'message_updated'].includes(payload.webhook_event_type)) return NextResponse.json({ ok: true })

  const ev = payload.webhook_event
  after(async () => {
    try {
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
