/**
 * SFAサービス層の読み取り系スモークテスト（DBへの書き込みなし）
 *   npx tsx --env-file=.env.local scripts/sfa_smoke_read.ts
 */
import { getDeal, getTodayBoard, listDeals, listMembers, listQuoteQueue, pipelineSummary } from '../src/lib/sfa/service'

async function main() {
  const board = await getTodayBoard()
  console.log('today', board.today, {
    overdue: board.overdue.length, due_today: board.due_today.length, upcoming: board.upcoming.length,
    no_next: board.no_next.length, answer_waiting: board.answer_waiting.length, quote_queue: board.quote_queue.length,
  })
  const deals = await listDeals({ q: 'やっ家' })
  console.log('search やっ家', deals.map((d) => `${d.id}:${d.company_name}[${d.stage}] next=${d.next_due_on}`))
  const target = deals[0] ?? (await listDeals({ open: true, limit: 1 }))[0]
  if (target) {
    const d = await getDeal(target.id) as unknown as { activities: unknown[]; tasks: unknown[]; quote_requests: unknown[]; company: { name: string } }
    console.log('deal', target.id, d.company.name, { activities: d.activities.length, tasks: d.tasks.length, quotes: d.quote_requests.length })
  }
  console.log('queue', (await listQuoteQueue()).map((q) => `#Q-${q.id} ${q.company_name} ${q.status}`))
  const p = await pipelineSummary()
  console.log('pipeline', p.total, p.by_stage, p.conversion)
  console.log('members', (await listMembers()).map((m) => `${m.name}/${m.tenant_name}/${m.role}`))
}

main().catch((e) => { console.error(e); process.exit(1) })
