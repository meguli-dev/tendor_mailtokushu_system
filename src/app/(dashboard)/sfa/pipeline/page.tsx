'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { OPEN_STAGES, STAGES, type Stage } from '@/lib/sfa/constants'
import { StageBadge, TempMark } from '@/components/sfa/stage-badge'
import type { DealOverview } from '@/components/sfa/types'
import { api, fmtDate, todayJst } from '@/components/sfa/utils'
import { cn } from '@/lib/utils'

interface Summary {
  total: number
  by_stage: Record<string, number>
  conversion: { won_or_registered: number; rate: number }
}

export default function PipelinePage() {
  const [deals, setDeals] = useState<DealOverview[] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const today = todayJst()

  const load = useCallback(() =>
    Promise.all([api<DealOverview[]>('/api/sfa/deals?open=1'), api<Summary>('/api/sfa/pipeline')])
      .then(([d, s]) => { setDeals(d); setSummary(s) })
      .catch(() => setDeals([])), [])

  useEffect(() => { load() }, [load])

  async function changeStage(deal: DealOverview, stage: Stage) {
    try {
      await api(`/api/sfa/deals/${deal.id}`, { method: 'PATCH', json: { stage } })
      toast.success(`${deal.company_name} を「${stage}」にしました`)
      load()
    } catch { /* toast済み */ }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">パイプライン</h1>
        {summary && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>総案件 {summary.total}</span>
            <span>受注 {summary.by_stage['受注'] ?? 0}</span>
            <span>会員登録 {summary.by_stage['会員登録'] ?? 0}</span>
            <span>失注 {summary.by_stage['失注'] ?? 0}</span>
            <span className="font-medium text-foreground">登録・受注率 {summary.conversion.rate}%</span>
          </div>
        )}
      </div>

      {!deals && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {deals && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {OPEN_STAGES.map((stage) => {
            const col = deals.filter((d) => d.stage === stage)
            return (
              <div key={stage} className="flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-muted/50 p-2">
                <div className="flex items-center justify-between px-1">
                  <StageBadge stage={stage} />
                  <span className="text-xs text-muted-foreground">{col.length}件</span>
                </div>
                {col.map((d) => {
                  const overdue = d.next_due_on && d.next_due_on < today
                  return (
                    <div key={d.id} className="space-y-1 rounded-md border bg-background p-2 text-xs">
                      <Link href={`/sfa/deals/${d.id}`} className="block break-all text-sm font-medium hover:underline">{d.company_name}</Link>
                      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                        {d.owner_name && <span>{d.owner_name}</span>}
                        <TempMark temperature={d.temperature} />
                      </div>
                      <div className={cn(overdue ? 'font-medium text-red-600 dark:text-red-400' : d.next_due_on ? '' : 'text-orange-600 dark:text-orange-400')}>
                        {d.next_due_on ? `次回 ${fmtDate(d.next_due_on)} ${d.next_kind ?? ''}` : '次回予定なし'}
                      </div>
                      {d.stage === '検討中' && d.answer_due && <div className="text-amber-700 dark:text-amber-400">回答予定 {fmtDate(d.answer_due)}</div>}
                      <select
                        className="h-7 w-full rounded border border-input bg-transparent px-1 text-xs dark:bg-input/30"
                        value={d.stage}
                        onChange={(e) => changeStage(d, e.target.value as Stage)}
                      >
                        {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )
                })}
                {col.length === 0 && <p className="px-1 text-xs text-muted-foreground">なし</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
