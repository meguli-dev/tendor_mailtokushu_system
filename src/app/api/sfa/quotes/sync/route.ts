import { withMember } from '@/lib/sfa/api'
import { syncQuoteRoom } from '@/lib/sfa/quote-ingest'

/** 見積書ルームを今すぐ確認して取り込む（Webhookの取りこぼし回収） */
export async function POST() {
  return withMember(async () => ({ results: await syncQuoteRoom() }))
}
