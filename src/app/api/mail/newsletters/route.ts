import { withUser } from '@/lib/mail/api'
import { listSendableNewsletters } from '@/lib/mail/service'

/** 配信に使えるメルマガ（HTML出力済み）の一覧 */
export async function GET() {
  return withUser(async () => listSendableNewsletters())
}
