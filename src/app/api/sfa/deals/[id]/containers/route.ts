import { idParam, parseBody, withMember } from '@/lib/sfa/api'
import { containerSchema } from '@/lib/sfa/schemas'
import { addContainer } from '@/lib/sfa/service'

type Ctx = { params: Promise<{ id: string }> }

/** 使用中容器の追加 */
export async function POST(request: Request, { params }: Ctx) {
  return withMember(async () => addContainer(idParam((await params).id), await parseBody(request, containerSchema)))
}
