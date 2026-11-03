import { NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/sfa/cron'
import { retryBcartWriteback } from '@/lib/mail/service'
import { dispatchDue } from '@/lib/mail/worker'

export const maxDuration = 300

/**
 * 毎分（vercel.json の crons）:
 * - 予約時刻を過ぎた配信を送り始める
 * - 途中で止まった送信を再開する
 * - 配信停止のBカート書き戻しに失敗したものを再試行する（毎時0分のみ）
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const dispatched = await dispatchDue()
    const retried = new Date().getUTCMinutes() === 0 ? await retryBcartWriteback() : null
    return NextResponse.json({ dispatched, retried })
  } catch (e) {
    console.error('[cron mail-dispatch]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
