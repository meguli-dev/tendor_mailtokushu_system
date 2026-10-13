import { idParam, parseBody, withMember } from '@/lib/sfa/api'
import { logContactSchema } from '@/lib/sfa/schemas'
import { logContact } from '@/lib/sfa/service'

type Ctx = { params: Promise<{ id: string }> }

/** 接触の記録（架電結果・見積提示など）＋次のアクション */
export async function POST(request: Request, { params }: Ctx) {
  return withMember(async (m) => {
    const deal_id = idParam((await params).id)
    return logContact(m, { deal_id, ...(await parseBody(request, logContactSchema)) })
  })
}
