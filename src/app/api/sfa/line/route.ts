import { withMember } from '@/lib/sfa/api'
import { listPendingLineUsers, listUnlinkedLineUsers } from '@/lib/sfa/line'

/** LINE: 未対応と未紐付け。?mine=1 で未対応を自分の担当に絞る */
export async function GET(request: Request) {
  return withMember(async (m) => {
    const mine = new URL(request.url).searchParams.get('mine') === '1'
    const [pending, unlinked] = await Promise.all([listPendingLineUsers({ ownerId: mine ? m.id : undefined }), listUnlinkedLineUsers()])
    return { pending, unlinked }
  })
}
