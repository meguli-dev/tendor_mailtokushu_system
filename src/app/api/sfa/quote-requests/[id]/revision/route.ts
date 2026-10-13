import { idParam, withMember } from '@/lib/sfa/api'
import { revisionSchema } from '@/lib/sfa/schemas'
import { requestRevision } from '@/lib/sfa/service'

type Ctx = { params: Promise<{ id: string }> }

/** 修正依頼。multipart（note + 任意の参考ファイル file）または JSON { note } */
export async function POST(request: Request, { params }: Ctx) {
  return withMember(async (m) => {
    const id = idParam((await params).id)
    if ((request.headers.get('content-type') || '').includes('multipart/form-data')) {
      const form = await request.formData()
      const { note } = revisionSchema.parse({ note: form.get('note') })
      const file = form.get('file')
      const attachment = file instanceof File && file.size > 0
        ? { buffer: Buffer.from(await file.arrayBuffer()), file_name: file.name, mime_type: file.type || 'application/octet-stream' }
        : null
      return requestRevision(m, { quote_request_id: id, note, attachment })
    }
    const { note } = revisionSchema.parse(await request.json().catch(() => ({})))
    return requestRevision(m, { quote_request_id: id, note })
  })
}
