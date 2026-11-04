import { idParam, withUser } from '@/lib/mail/api'
import { campaignReport } from '@/lib/mail/service'

type Ctx = { params: Promise<{ id: string }> }

/** 進捗・レポート（送信中は画面がポーリングする） */
export async function GET(_req: Request, { params }: Ctx) {
  return withUser(async () => campaignReport(idParam((await params).id)))
}
