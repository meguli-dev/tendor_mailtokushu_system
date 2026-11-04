import { z } from 'zod'
import { idParam, parseBody, withUser } from '@/lib/mail/api'
import { deleteCampaign, getCampaign, previewHtml, updateCampaign } from '@/lib/mail/service'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Ctx) {
  return withUser(async () => {
    const id = idParam((await params).id)
    if (new URL(request.url).searchParams.get('preview') === '1') {
      return new Response(await previewHtml(id), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }
    return getCampaign(id)
  })
}

const patchSchema = z.object({
  subject: z.string().trim().min(1, '件名を入力してください').max(200).optional(),
  preheader: z.string().max(200).nullable().optional(),
  greeting: z.boolean().optional(),
  html_snapshot: z.string().min(1).optional(),
})

export async function PATCH(request: Request, { params }: Ctx) {
  return withUser(async () => updateCampaign(idParam((await params).id), await parseBody(request, patchSchema)))
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return withUser(async () => { await deleteCampaign(idParam((await params).id)); return { ok: true } })
}
