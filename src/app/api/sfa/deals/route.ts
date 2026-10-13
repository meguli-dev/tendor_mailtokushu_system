import { parseBody, withMember } from '@/lib/sfa/api'
import { STAGES, type Stage } from '@/lib/sfa/constants'
import { appointmentSchema } from '@/lib/sfa/schemas'
import { createAppointment, listDeals } from '@/lib/sfa/service'

/** 案件一覧 ?q=&stage=a,b&open=1|0&owner= */
export async function GET(request: Request) {
  return withMember(async () => {
    const sp = new URL(request.url).searchParams
    const stages = (sp.get('stage') || '').split(',').filter((s): s is Stage => (STAGES as readonly string[]).includes(s))
    return listDeals({
      q: sp.get('q') || undefined,
      stage: stages.length ? stages : undefined,
      open: sp.get('open') === '1' ? true : sp.get('open') === '0' ? false : undefined,
      ownerId: sp.get('owner') ? Number(sp.get('owner')) : undefined,
      limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
    })
  })
}

/** アポ登録（会社・担当者・案件・次のアクションを一括作成） */
export async function POST(request: Request) {
  return withMember(async (m) => createAppointment(m, await parseBody(request, appointmentSchema)))
}
