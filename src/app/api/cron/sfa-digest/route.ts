import { NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/sfa/cron'
import { sendDailyDigests } from '@/lib/sfa/digest'

export const maxDuration = 60

/** 毎朝のまとめ通知（vercel.json の crons から呼ばれる。日曜は送らない） */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const jstDay = new Date(Date.now() + 9 * 3600_000).getUTCDay()
  if (jstDay === 0) return NextResponse.json({ skipped: 'sunday' })
  try {
    return NextResponse.json(await sendDailyDigests())
  } catch (e) {
    console.error('[cron sfa-digest]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
