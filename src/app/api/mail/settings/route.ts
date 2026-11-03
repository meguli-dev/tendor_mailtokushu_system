import { z } from 'zod'
import { parseBody, withUser } from '@/lib/mail/api'
import { getSettingsWithGroups, listSuppressions, updateSettings } from '@/lib/mail/service'

export async function GET() {
  return withUser(async () => ({ ...(await getSettingsWithGroups()), suppressions: await listSuppressions() }))
}

const schema = z.object({
  excluded_view_group_ids: z.array(z.number().int()).optional(),
  from_name: z.string().trim().min(1, '差出人名を入力してください').max(60).optional(),
  from_email: z.string().trim().email('差出人アドレスが正しくありません').nullable().optional(),
  reply_to: z.string().trim().email('返信先アドレスが正しくありません').nullable().optional(),
  footer_html: z.string().nullable().optional(),
})

export async function PUT(request: Request) {
  return withUser(async () => updateSettings(await parseBody(request, schema)))
}
