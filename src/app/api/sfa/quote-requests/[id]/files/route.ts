import { idParam, withMember } from '@/lib/sfa/api'
import { addQuoteFile, assertCanUploadQuote, SfaError } from '@/lib/sfa/service'

type Ctx = { params: Promise<{ id: string }> }

/** 見積書のアップロード（multipart: file, note）。テンドールまたは管理者のみ */
export async function POST(request: Request, { params }: Ctx) {
  return withMember(async (m) => {
    await assertCanUploadQuote(m)
    const id = idParam((await params).id)
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) throw new SfaError('ファイルを選択してください')
    return addQuoteFile(m, {
      quote_request_id: id,
      buffer: Buffer.from(await file.arrayBuffer()),
      file_name: file.name,
      mime_type: file.type || null,
      note: (form.get('note') as string | null) || null,
      source: 'ui',
    })
  })
}
