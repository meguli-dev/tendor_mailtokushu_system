import { NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/sfa/cron'
import { syncQuoteRoom } from '@/lib/sfa/quote-ingest'

export const maxDuration = 60

/** 見積書ルームの取りこぼし回収（Webhookの保険。1日1回） */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ results: await syncQuoteRoom() })
  } catch (e) {
    console.error('[cron chatwork-sync]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
