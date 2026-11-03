import { z } from 'zod'
import { parseBody, withUser } from '@/lib/mail/api'
import { createCampaign, listCampaigns } from '@/lib/mail/service'

export async function GET() {
  return withUser(async () => listCampaigns())
}

const createSchema = z.object({
  newsletter_id: z.string().uuid('メルマガIDが正しくありません'),
  html: z.string().optional(),
  subject: z.string().optional(),
})

/** メルマガから配信を作る（Step3の「配信を作成」） */
export async function POST(request: Request) {
  return withUser(async (userId) => createCampaign({ ...(await parseBody(request, createSchema)), userId }))
}
