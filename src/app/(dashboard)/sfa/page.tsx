'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DealRow } from '@/components/sfa/deal-row'
import { LogContactDialog } from '@/components/sfa/log-contact-dialog'
import { QuoteStatusBadge } from '@/components/sfa/stage-badge'
import type { DealOverview, TodayBoard } from '@/components/sfa/types'
import { useMembers } from '@/components/sfa/use-members'
import { api, fmtDate, selectClass } from '@/components/sfa/utils'
import { cn } from '@/lib/utils'

function Section({ title, count, tone, children, empty }: {
  title: string; count: number; tone?: 'red' | 'amber' | 'orange'; children: React.ReactNode; empty?: string
}) {
  return (
    <section className="space-y-2">
      <h2 className={cn('flex items-center gap-2 text-sm font-bold',
        tone === 'red' && 'text-red-600 dark:text-red-400',
        tone === 'amber' && 'text-amber-700 dark:text-amber-400',
        tone === 'orange' && 'text-orange-600 dark:text-orange-400')}>
        {title}<span className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{count}</span>
      </h2>
      {count === 0 ? <p className="text-xs text-muted-foreground">{empty ?? 'なし'}</p> : <div className="space-y-2">{children}</div>}
    </section>
  )
}

export default function SfaTodayPage() {
  const members = useMembers()
  const [mine, setMine] = useState(false)
  const [owner, setOwner] = useState('')
  const [board, setBoard] = useState<TodayBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [logTarget, setLogTarget] = useState<DealOverview | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = mine ? '?mine=1' : owner ? `?owner=${owner}` : ''
      setBoard(await api<TodayBoard>(`/api/sfa/today${qs}`))
    } catch {
      setBoard(null)
    } finally {
      setLoading(false)
    }
  }, [mine, owner])

  useEffect(() => { load() }, [load])

  const row = (d: DealOverview, red?: boolean) => (
    <DealRow key={d.id} deal={d} onLog={setLogTarget} highlight={red ? 'red' : undefined} />
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">今日のToDo</h1>
          {board && (
            <p className="text-sm text-muted-foreground">
              {fmtDate(board.today)} ／ 進行中 {board.counts.open ?? 0}件
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={mine} onCheckedChange={(v) => { setMine(v); if (v) setOwner('') }} />
            自分の担当のみ
          </label>
          {!mine && (
            <select className={cn(selectClass, 'w-36')} value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">全担当</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />更新
          </Button>
          <Button size="sm" asChild>
            <Link href="/sfa/deals/new"><Plus className="h-3.5 w-3.5" />アポ登録</Link>
          </Button>
        </div>
      </div>

      {loading && !board && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {board && (
        <div className="space-y-6">
          <Section title="期限切れ（未対応）" count={board.overdue.length} tone="red" empty="期限切れはありません">
            {board.overdue.map((d) => row(d, true))}
          </Section>
          <Section title="今日やること" count={board.due_today.length}>
            {board.due_today.map((d) => row(d))}
          </Section>
          <Section title="回答待ち（検討中）" count={board.answer_waiting.length} tone="amber">
            {board.answer_waiting.map((d) => row(d))}
          </Section>
          <Section title="次回予定が未設定" count={board.no_next.length} tone="orange" empty="すべての案件に次回予定があります">
            {board.no_next.map((d) => row(d))}
          </Section>
          <Section title="7日以内の予定" count={board.upcoming.length}>
            {board.upcoming.map((d) => row(d))}
          </Section>
          <Section title="見積作成待ち" count={board.quote_queue.length}>
            {board.quote_queue.map((q) => (
              <div key={q.id} className="flex flex-col gap-1 rounded-lg border bg-background p-3 text-sm sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <Link href={`/sfa/deals/${q.deal_id}`} className="font-medium hover:underline">{q.company_name}</Link>
                  <QuoteStatusBadge status={q.status} />
                  <span className="text-xs text-muted-foreground">#Q-{q.id}・依頼 {fmtDate(q.requested_at.slice(0, 10))}</span>
                  {q.due_on && <span className="text-xs text-amber-700 dark:text-amber-400">回答希望 {fmtDate(q.due_on)}</span>}
                  {q.owner_name && <span className="text-xs text-muted-foreground">担当: {q.owner_name}</span>}
                </div>
                {q.request_note && <div className="truncate text-xs text-muted-foreground sm:max-w-[40%]">{q.request_note}</div>}
              </div>
            ))}
          </Section>
        </div>
      )}

      <LogContactDialog
        target={logTarget}
        open={!!logTarget}
        onOpenChange={(o) => { if (!o) setLogTarget(null) }}
        onSaved={load}
      />
    </div>
  )
}
