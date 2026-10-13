import { idParam, parseBody, withMember } from '@/lib/sfa/api'
import { dealPatchSchema } from '@/lib/sfa/schemas'
import { getDeal, updateCompany, updateDeal, upsertContact } from '@/lib/sfa/service'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  return withMember(async () => getDeal(idParam((await params).id)))
}

/** 案件・会社・担当者の更新（段階変更は履歴を自動記録） */
export async function PATCH(request: Request, { params }: Ctx) {
  return withMember(async (m) => {
    const id = idParam((await params).id)
    const { company, contact, ...patch } = await parseBody(request, dealPatchSchema)
    const deal = await getDeal(id) as unknown as { company_id: number }
    if (company && Object.keys(company).length) await updateCompany(deal.company_id, company)
    if (contact && Object.keys(contact).length) await upsertContact(deal.company_id, contact, id)
    await updateDeal(m, id, patch)
    return getDeal(id)
  })
}
