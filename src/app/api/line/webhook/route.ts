/**
 * LINE Messaging API Webhook（容器なび 顧客サポート）
 *   LINE Developers の Webhook URL をここに向ける: /api/line/webhook
 *   署名（x-line-signature）を LINE_CHANNEL_SECRET で検証する。
 *   LINEへは即200を返し、記録・通知は after() で行う。SFAからLINEへの送信（返信・push）はしない。
 */
import { after, NextResponse } from 'next/server'
import { handleLineEvents, verifyLineSignature, type LineEvent } from '@/lib/sfa/line'

export const maxDuration = 60

export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifyLineSignature(raw, request.headers.get('x-line-signature'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }
  const { events = [] } = JSON.parse(raw) as { events?: LineEvent[] }
  // LINE Developers の「検証」ボタンは events が空で届く
  if (!events.length) return NextResponse.json({ ok: true })

  after(async () => {
    try {
      const results = await handleLineEvents(events)
      console.log('[line webhook]', JSON.stringify(results))
    } catch (e) {
      console.error('[line webhook] 処理に失敗', e)
    }
  })
  return NextResponse.json({ ok: true })
}
