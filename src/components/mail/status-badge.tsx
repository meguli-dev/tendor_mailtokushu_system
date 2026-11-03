import type { CampaignStatus } from '@/lib/mail/service'
import { cn } from '@/lib/utils'

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: '下書き',
  tested: 'テスト済み',
  scheduled: '予約中',
  sending: '送信中',
  sent: '送信完了',
  partial: '一部失敗',
  canceled: '取り消し',
}

const STATUS_CLASS: Record<CampaignStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  tested: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  scheduled: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  sending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  sent: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  partial: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  canceled: 'bg-muted text-muted-foreground',
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', STATUS_CLASS[status])}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function pct(n: number, d: number) {
  return d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : '—'
}
