import { idParam, withMember } from '@/lib/sfa/api'
import { addQuoteFile, assertCanUploadQuote, ensureQuoteRequest, SfaError } from '@/lib/sfa/service'

type Ctx = { params: Promise<{ id: string }> }

/**
 * 案件に見積書を直接アップロード（multipart: file, note）。テンドールまたは管理者のみ
 *   未完了の見積依頼があればその次の版、無ければ見積依頼を自動作成して第1版にする
 */
export async function POST(request: Request, { params }: Ctx) {
  return withMember(async (m) => {
    await assertCanUploadQuote(m)
    const dealId = idParam((await params).id)
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) throw new SfaError('ファイルを選択してください')
    const quoteRequestId = await ensureQuoteRequest(dealId, '画面からの見積書登録')
    return addQuoteFile(m, {
      quote_request_id: quoteRequestId,
      buffer: Buffer.from(await file.arrayBuffer()),
      file_name: file.name,
      mime_type: file.type || null,
      note: (form.get('note') as string | null) || null,
      source: 'ui',
    })
  })
}
