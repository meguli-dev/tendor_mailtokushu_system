import { idParam, withMember } from '@/lib/sfa/api'
import { issueMcpKey, SfaAuthError } from '@/lib/sfa/member'

type Ctx = { params: Promise<{ id: string }> }

/** MCP個人キーの発行（本人または管理者）。平文はこのレスポンスでしか返さない */
export async function POST(_req: Request, { params }: Ctx) {
  return withMember(async (m) => {
    const id = idParam((await params).id)
    if (m.role !== 'admin' && m.id !== id) throw new SfaAuthError('自分のキーのみ発行できます')
    return { key: await issueMcpKey(id) }
  })
}
