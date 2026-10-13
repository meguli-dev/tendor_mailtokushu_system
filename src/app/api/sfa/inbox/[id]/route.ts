import { z } from 'zod'
import { idParam, parseBody, withMember } from '@/lib/sfa/api'
import { dismissInbox, resolveInbox } from '@/lib/sfa/quote-ingest'

type Ctx = { params: Promise<{ id: string }> }

const schema = z.object({
  quote_request_id: z.number().int().optional(),
  deal_id: z.number().int().optional(),
  dismiss: z.boolean().optional(),
})

/** 仕分け待ちの確定（見積依頼 or 案件に紐付け）または対象外にする */
export async function POST(request: Request, { params }: Ctx) {
  return withMember(async (m) => {
    const id = idParam((await params).id)
    const body = await parseBody(request, schema)
    if (body.dismiss) return dismissInbox(m, id)
    return resolveInbox(m, id, body)
  })
}
