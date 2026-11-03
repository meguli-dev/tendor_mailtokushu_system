import { idParam, parseBody, withMember } from '@/lib/sfa/api'
import { markLineHandled } from '@/lib/sfa/line'
import { lineHandledSchema } from '@/lib/sfa/schemas'

type Ctx = { params: Promise<{ id: string }> }

/** LINEの未対応を対応済にする */
export async function POST(request: Request, { params }: Ctx) {
  return withMember(async (m) => {
    const { memo } = await parseBody(request, lineHandledSchema)
    return markLineHandled(m, idParam((await params).id), { memo })
  })
}
