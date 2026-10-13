import { STAGE_STYLE, type QuoteStatus, type Stage, type Temperature } from '@/lib/sfa/constants'
import { cn } from '@/lib/utils'

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', STAGE_STYLE[stage], className)}>
      {stage}
    </span>
  )
}

const TEMP_STYLE: Record<Temperature, string> = {
  '高': 'text-red-600 dark:text-red-400',
  '中': 'text-amber-600 dark:text-amber-400',
  '低': 'text-slate-500 dark:text-slate-400',
}

export function TempMark({ temperature }: { temperature: Temperature | null }) {
  if (!temperature) return null
  return <span className={cn('text-xs font-bold', TEMP_STYLE[temperature])}>温度{temperature}</span>
}

const QUOTE_STYLE: Record<QuoteStatus, string> = {
  '依頼中': 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  '作成中': 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  '修正依頼': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  '作成済': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  '提示済': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  '取消': 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
}

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return <span className={cn('inline-flex shrink-0 rounded px-1.5 py-0.5 text-xs font-medium', QUOTE_STYLE[status])}>{status}</span>
}
