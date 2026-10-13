import { withMember } from '@/lib/sfa/api'
import { isQuoteMaker } from '@/lib/sfa/service'

/** ログイン中のSFAメンバー（画面の出し分け用） */
export async function GET() {
  return withMember(async (m) => ({
    id: m.id, name: m.name, role: m.role, tenant_id: m.tenant_id,
    is_quote_maker: await isQuoteMaker(m),
  }))
}
