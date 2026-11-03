import { idParam, parseBody, withMember } from '@/lib/sfa/api'
import { linkLineUser, unlinkLineUser } from '@/lib/sfa/line'
import { lineLinkSchema } from '@/lib/sfa/schemas'

type Ctx = { params: Promise<{ id: string }> }

/** LINE友だちを案件に紐付ける（deal_id=null で解除） */
export async function POST(request: Request, { params }: Ctx) {
  return withMember(async (m) => {
    const id = idParam((await params).id)
    const { deal_id, note } = await parseBody(request, lineLinkSchema)
    return deal_id ? linkLineUser(m, id, deal_id, note) : unlinkLineUser(m, id)
  })
}
