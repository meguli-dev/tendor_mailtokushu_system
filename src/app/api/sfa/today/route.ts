import { withMember } from '@/lib/sfa/api'
import { getTodayBoard } from '@/lib/sfa/service'

/** 今日のボード。?owner=<id> で対応担当を絞る（mine=1 で自分） */
export async function GET(request: Request) {
  return withMember(async (m) => {
    const sp = new URL(request.url).searchParams
    const ownerId = sp.get('mine') === '1' ? m.id : sp.get('owner') ? Number(sp.get('owner')) : undefined
    return getTodayBoard({ ownerId })
  })
}
