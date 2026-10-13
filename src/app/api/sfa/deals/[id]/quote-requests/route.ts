import { idParam, parseBody, withMember } from '@/lib/sfa/api'
import { quoteRequestSchema } from '@/lib/sfa/schemas'
import { requestQuote } from '@/lib/sfa/service'

type Ctx = { params: Promise<{ id: string }> }

/** 見積作成依頼（見積書ルームに依頼を投稿） */
export async function POST(request: Request, { params }: Ctx) {
  return withMember(async (m) => requestQuote(m, { deal_id: idParam((await params).id), ...(await parseBody(request, quoteRequestSchema)) }))
}
