import { idParam, withUser } from '@/lib/mail/api'
import { listRecipients, refreshAudience } from '@/lib/mail/service'

type Ctx = { params: Promise<{ id: string }> }

export const maxDuration = 60

/** 宛先一覧（検索・ページング） */
export async function GET(request: Request, { params }: Ctx) {
  return withUser(async () => {
    const sp = new URL(request.url).searchParams
    return listRecipients(idParam((await params).id), {
      q: sp.get('q') || undefined,
      limit: Math.min(Number(sp.get('limit')) || 50, 200),
      offset: Number(sp.get('offset')) || 0,
    })
  })
}

/** 「宛先を更新」: Bカートから会員を取得して送る人を確定し直す */
export async function POST(_req: Request, { params }: Ctx) {
  return withUser(async () => refreshAudience(idParam((await params).id)))
}
