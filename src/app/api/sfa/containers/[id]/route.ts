import { idParam, parseBody, withMember } from '@/lib/sfa/api'
import { containerSchema } from '@/lib/sfa/schemas'
import { deleteContainer, updateContainer } from '@/lib/sfa/service'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Ctx) {
  return withMember(async () => updateContainer(idParam((await params).id), await parseBody(request, containerSchema.partial())))
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return withMember(async () => deleteContainer(idParam((await params).id)))
}
