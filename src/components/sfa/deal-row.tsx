'use client'

import Link from 'next/link'
import { Phone, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StageBadge, TempMark } from './stage-badge'
import type { DealOverview } from './types'
import { fmtDate, telHref } from './utils'

/** 今日のボード・一覧で使う案件の1行 */
export function DealRow({ deal, onLog, highlight }: { deal: DealOverview; onLog?: (d: DealOverview) => void; highlight?: 'red' }) {
  const tel = deal.contact_mobile || deal.phone
  return (
    <div className={cn('flex flex-col gap-1.5 rounded-lg border bg-background p-3 text-sm sm:flex-row sm:items-start sm:gap-3', highlight === 'red' && 'border-red-300 dark:border-red-900')}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/sfa/deals/${deal.id}`} className="min-w-0 break-all font-medium hover:underline">{deal.company_name}</Link>
          <StageBadge stage={deal.stage} />
          <TempMark temperature={deal.temperature} />
          {deal.owner_name && <span className="text-xs text-muted-foreground">担当: {deal.owner_name}</span>}
        </div>

        <div className="text-xs">
          {deal.next_due_on ? (
            <span className={cn(highlight === 'red' && 'font-medium text-red-600 dark:text-red-400')}>
              次回 {fmtDate(deal.next_due_on)} {deal.next_kind}
              {deal.next_note && <span className="text-muted-foreground">：{deal.next_note}</span>}
            </span>
          ) : (
            <span className="text-orange-600 dark:text-orange-400">次回予定なし</span>
          )}
          {deal.answer_due && deal.stage === '検討中' && <span className="ml-2 text-amber-700 dark:text-amber-400">回答予定 {fmtDate(deal.answer_due)}</span>}
        </div>

        {deal.considering && <div className="text-xs text-muted-foreground">検討: {deal.considering}</div>}
        {deal.last_contact_on && (
          <div className="truncate text-xs text-muted-foreground">
            最終 {fmtDate(deal.last_contact_on)}：{deal.last_contact_body}
          </div>
        )}
        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {deal.contact_name && <span>{deal.contact_name}</span>}
          {deal.best_time && <span>都合: {deal.best_time.slice(0, 40)}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {tel && (
          <Button variant="outline" size="sm" asChild>
            <a href={telHref(tel)}><Phone className="h-3.5 w-3.5" />{tel}</a>
          </Button>
        )}
        {onLog && (
          <Button size="sm" onClick={() => onLog(deal)}>
            <PenLine className="h-3.5 w-3.5" />結果を記録
          </Button>
        )}
      </div>
    </div>
  )
}
