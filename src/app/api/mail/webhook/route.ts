import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { handleWebhook, type ResendWebhookEvent } from '@/lib/mail/service'

/** Resend Webhook（公開。svix署名で検証する） */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'RESEND_WEBHOOK_SECRET が未設定です' }, { status: 500 })
  const body = await request.text()
  const headers = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  }
  let event: ResendWebhookEvent
  try {
    event = new Webhook(secret).verify(body, headers) as unknown as ResendWebhookEvent
  } catch {
    return NextResponse.json({ error: '署名が正しくありません' }, { status: 401 })
  }
  try {
    return NextResponse.json(await handleWebhook(headers['svix-id'], event))
  } catch (e) {
    console.error('[mail webhook]', e)
    // 500を返すとResendが再送する（mm_events.svix_id で二重計上はしない）
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
