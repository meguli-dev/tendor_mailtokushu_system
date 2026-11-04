import { after } from 'next/server'
import { z } from 'zod'
import { idParam, parseBody, withUser } from '@/lib/mail/api'
import { cancelSchedule, prepareResume, startSend } from '@/lib/mail/service'
import { runCampaign } from '@/lib/mail/worker'

type Ctx = { params: Promise<{ id: string }> }

export const maxDuration = 300

const schema = z.object({
  action: z.enum(['send', 'cancel_schedule', 'resume']).default('send'),
  confirm_count: z.number().int().optional(),
  scheduled_at: z.string().nullable().optional(), // ISO文字列。あれば予約
})

/** 本配信・予約・予約取り消し・再開 */
export async function POST(request: Request, { params }: Ctx) {
  return withUser(async () => {
    const id = idParam((await params).id)
    const body = await parseBody(request, schema)
    if (body.action === 'cancel_schedule') return cancelSchedule(id)
    if (body.action === 'resume') {
      await prepareResume(id)
      after(() => runCampaign(id).catch((e) => console.error('[mail worker]', id, e)))
      return { ok: true }
    }
    const { campaign, startNow } = await startSend(id, body.confirm_count ?? -1, body.scheduled_at)
    if (startNow) after(() => runCampaign(id).catch((e) => console.error('[mail worker]', id, e)))
    return campaign
  })
}
