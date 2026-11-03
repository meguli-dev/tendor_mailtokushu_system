import { NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/sfa/cron'
import { remindPendingLine, sendLineEndOfDay } from '@/lib/sfa/line'

export const maxDuration = 60

/**
 * LINE未対応の再通知・終業まとめ（vercel.json の crons から呼ばれる。日曜は送らない）
 *   ?mode=remind : 2時間以上未対応のものを担当者に再通知（営業時間内のみ）
 *   ?mode=eod    : 終業時に未対応をまとめてテンドールの通知ルームへ
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const jstDay = new Date(Date.now() + 9 * 3600_000).getUTCDay()
  if (jstDay === 0) return NextResponse.json({ skipped: 'sunday' })
  const mode = new URL(request.url).searchParams.get('mode')
  try {
    if (mode === 'eod') return NextResponse.json(await sendLineEndOfDay())
    return NextResponse.json(await remindPendingLine())
  } catch (e) {
    console.error('[cron sfa-line]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
