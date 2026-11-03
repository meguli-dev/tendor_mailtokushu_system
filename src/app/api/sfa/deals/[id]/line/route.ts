import { idParam, parseBody, withMember } from '@/lib/sfa/api'
import { createLineInvite, getDealLine } from '@/lib/sfa/line'
import { lineInviteSchema } from '@/lib/sfa/schemas'

type Ctx = { params: Promise<{ id: string }> }

/** 案件に紐付いているLINEと招待履歴 */
export async function GET(_request: Request, { params }: Ctx) {
  return withMember(async () => getDealLine(idParam((await params).id)))
}

/** LINE招待（SMS文面とURL）を作り、招待した記録を残す */
export async function POST(request: Request, { params }: Ctx) {
  return withMember(async (m) => {
    const { phone } = await parseBody(request, lineInviteSchema)
    return createLineInvite(m, idParam((await params).id), phone)
  })
}
