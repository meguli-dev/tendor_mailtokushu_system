import { idParam, parseBody, withMember } from '@/lib/sfa/api'
import { quoteContentSchema } from '@/lib/sfa/schemas'
import { confirmQuoteContent, reparseQuoteFile } from '@/lib/sfa/service'

type Ctx = { params: Promise<{ id: string }> }

/** 見積明細を直して確定する。テンドールまたは管理者のみ */
export async function PUT(request: Request, { params }: Ctx) {
  return withMember(async (m) => confirmQuoteContent(m, idParam((await params).id), await parseBody(request, quoteContentSchema)))
}

/** 見積書PDFを読み取り直す。テンドールまたは管理者のみ */
export async function POST(_req: Request, { params }: Ctx) {
  return withMember(async (m) => reparseQuoteFile(m, idParam((await params).id)))
}
