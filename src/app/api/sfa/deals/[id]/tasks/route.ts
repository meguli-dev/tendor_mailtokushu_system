import { idParam, parseBody, withMember } from '@/lib/sfa/api'
import { taskSchema } from '@/lib/sfa/schemas'
import { completeTask, createTask, rescheduleTask, SfaError } from '@/lib/sfa/service'

type Ctx = { params: Promise<{ id: string }> }

/** タスク操作 { action: create | reschedule | complete } */
export async function POST(request: Request, { params }: Ctx) {
  return withMember(async (m) => {
    const dealId = idParam((await params).id)
    const body = await parseBody(request, taskSchema)
    if (body.action === 'create') {
      if (!body.next?.due_on) throw new SfaError('日付を指定してください')
      await createTask(m, dealId, { due_on: body.next.due_on, kind: body.next.kind, note: body.next.note, due_time: body.next.due_time }, body.assignee_id)
    } else {
      if (!body.task_id) throw new SfaError('task_id を指定してください')
      if (body.action === 'complete') await completeTask(m, body.task_id)
      else await rescheduleTask(m, body.task_id, body.next || {})
    }
    return { ok: true }
  })
}
