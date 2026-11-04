import { z } from 'zod'
import { idParam, parseBody, withUser } from '@/lib/mail/api'
import { sendTest } from '@/lib/mail/service'

type Ctx = { params: Promise<{ id: string }> }

const schema = z.object({ emails: z.array(z.string()).min(1, 'テスト送信先を入力してください').max(5, 'テスト配信は5件までです') })

export async function POST(request: Request, { params }: Ctx) {
  return withUser(async () => sendTest(idParam((await params).id), (await parseBody(request, schema)).emails))
}
