import { withMember } from '@/lib/sfa/api'
import { listInbox } from '@/lib/sfa/quote-ingest'
import { listQuoteQueue } from '@/lib/sfa/service'

/** 見積作成待ち（依頼中・作成中・修正依頼）と仕分け待ち */
export async function GET(request: Request) {
  return withMember(async () => {
    const withIgnored = new URL(request.url).searchParams.get('ignored') === '1'
    const [queue, inbox] = await Promise.all([listQuoteQueue(), listInbox(withIgnored)])
    return { queue, inbox }
  })
}
