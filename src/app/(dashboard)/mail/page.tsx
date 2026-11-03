'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CampaignStatusBadge, pct } from '@/components/mail/status-badge'
import { NewsletterPicker } from '@/components/mail/newsletter-picker'
import { api, fmtDateTime } from '@/components/sfa/utils'
import type { Campaign, CampaignStats } from '@/lib/mail/service'

type Row = Pick<Campaign, 'id' | 'subject' | 'status' | 'recipient_count' | 'scheduled_at' | 'started_at' | 'completed_at' | 'created_at'> & { stats: CampaignStats | null }

export default function MailListPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => { api<Row[]>('/api/mail/campaigns').then(setRows).catch(() => setRows([])) }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">メール配信</h1>
          <p className="text-sm text-muted-foreground">Bカートのメルマガ受信会員に、Resendで配信します。「新しい配信」から作成済みのメルマガを選ぶか、メルマガビルダーの生成結果画面の「配信を作成」から始めます。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link href="/mail/settings"><Settings className="h-4 w-4" />配信設定</Link></Button>
          <NewsletterPicker />
        </div>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">まだ配信はありません。右上の「新しい配信」から作成済みのメルマガを選んでください。</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">件名</th>
                  <th className="px-4 py-2 text-left font-medium">状態</th>
                  <th className="px-4 py-2 text-left font-medium">送信日時</th>
                  <th className="px-4 py-2 text-right font-medium">宛先</th>
                  <th className="px-4 py-2 text-right font-medium">クリック率</th>
                  <th className="px-4 py-2 text-right font-medium">開封率</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5"><Link href={`/mail/${r.id}`} className="font-medium hover:underline">{r.subject}</Link></td>
                    <td className="px-4 py-2.5"><CampaignStatusBadge status={r.status} /></td>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                      {r.status === 'scheduled' ? `${fmtDateTime(r.scheduled_at)}（予約）` : fmtDateTime(r.started_at) || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.recipient_count?.toLocaleString() ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.stats ? pct(r.stats.clicked, r.stats.delivered || r.stats.sent) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{r.stats ? pct(r.stats.opened, r.stats.delivered || r.stats.sent) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
