import { idParam, withMember } from '@/lib/sfa/api'
import { cancelQuoteRequest } from '@/lib/sfa/service'

type Ctx = { params: Promise<{ id: string }> }

/** 見積依頼の取消 */
export async function DELETE(_req: Request, { params }: Ctx) {
  return withMember(async (m) => cancelQuoteRequest(m, idParam((await params).id)))
}
