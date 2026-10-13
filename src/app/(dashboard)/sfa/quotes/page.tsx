'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Inbox, Loader2, RefreshCw, Search, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { QuoteUploadDialog } from '@/components/sfa/quote-dialogs'
import { QuoteStatusBadge, StageBadge } from '@/components/sfa/stage-badge'
import type { DealOverview, InboxItem, QuoteQueueItem } from '@/components/sfa/types'
import { api, fmtDate, fmtDateTime } from '@/components/sfa/utils'

export default function QuotesPage() {
  const [queue, setQueue] = useState<QuoteQueueItem[] | null>(null)
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const [syncing, setSyncing] = useState(false)
  const [uploadFor, setUploadFor] = useState<QuoteQueueItem | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await api<{ queue: QuoteQueueItem[]; inbox: InboxItem[] | null }>('/api/sfa/quotes')
      setQueue(d.queue)
      setInbox(d.inbox ?? [])
    } catch {
      setQueue([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function sync() {
    setSyncing(true)
    try {
      const r = await api<{ results: Array<{ decision: string }> }>('/api/sfa/quotes/sync', { method: 'POST' })
      const auto = r.results.filter((x) => x.decision === 'auto').length
      const box = r.results.filter((x) => x.decision === 'inbox').length
      toast.success(r.results.length ? `新しいファイル ${r.results.length}件（自動登録 ${auto}・仕分け待ち ${box}）` : '新しい見積書はありませんでした')
      load()
    } catch { /* toast済み */ } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">見積</h1>
          <p className="text-sm text-muted-foreground">見積書ルームに投稿されたPDFは自動で案件に登録されます。特定できなかったものは「仕分け待ち」に入ります。</p>
        </div>
        <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
          <RefreshCw className={syncing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />Chatworkを今すぐ確認
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Inbox className="h-4 w-4" />仕分け待ち <span className="rounded-full bg-muted px-2 text-xs">{inbox.length}</span></CardTitle>
          <CardDescription>候補をクリックすると、その見積依頼に新しい版として登録されます</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {inbox.length === 0 && <p className="text-sm text-muted-foreground">仕分け待ちはありません</p>}
          {inbox.map((it) => <InboxRow key={it.id} item={it} onDone={load} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">見積作成待ち <span className="rounded-full bg-muted px-2 text-xs">{queue?.length ?? 0}</span></CardTitle>
          <CardDescription>依頼中・作成中・修正依頼の見積</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!queue && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
          {queue?.length === 0 && <p className="text-sm text-muted-foreground">作成待ちの見積はありません</p>}
          {queue?.map((q) => (
            <div key={q.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/sfa/deals/${q.deal_id}`} className="font-medium hover:underline">{q.company_name}</Link>
                  <QuoteStatusBadge status={q.status} />
                  <span className="text-xs text-muted-foreground">#Q-{q.id}・依頼 {fmtDate(q.requested_at.slice(0, 10))}</span>
                  {q.due_on && <span className="text-xs text-amber-700 dark:text-amber-400">回答希望 {fmtDate(q.due_on)}</span>}
                  {q.owner_name && <span className="text-xs text-muted-foreground">担当: {q.owner_name}</span>}
                  {q.latest_version && <span className="text-xs text-muted-foreground">最新 第{q.latest_version}版</span>}
                </div>
                {q.request_note && <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{q.request_note}</p>}
              </div>
              <Button size="sm" variant="outline" onClick={() => setUploadFor(q)}><Upload className="h-3.5 w-3.5" />見積書をアップロード</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <QuoteUploadDialog
        quoteRequestId={uploadFor?.id ?? null} title={uploadFor?.company_name}
        open={!!uploadFor} onOpenChange={(o) => { if (!o) setUploadFor(null) }} onSaved={load}
      />
    </div>
  )
}

function InboxRow({ item, onDone }: { item: InboxItem; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<DealOverview[] | null>(null)

  async function resolve(body: Record<string, unknown>, msg: string) {
    setBusy(true)
    try {
      await api(`/api/sfa/inbox/${item.id}`, { method: 'POST', json: body })
      toast.success(msg)
      onDone()
    } catch { /* toast済み */ } finally {
      setBusy(false)
    }
  }

  async function search() {
    if (!q.trim()) return
    try {
      setResults(await api<DealOverview[]>(`/api/sfa/deals?q=${encodeURIComponent(q.trim())}&limit=10`))
    } catch { /* toast済み */ }
  }

  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{item.file_name}</span>
        <span className="text-xs text-muted-foreground">{item.account_name}・{fmtDateTime(item.created_at)}</span>
      </div>
      <p className="text-xs text-muted-foreground">{item.reason}{item.confidence != null && `（確信度 ${Math.round(item.confidence * 100)}%）`}</p>
      <div className="flex flex-wrap gap-1">
        {(item.candidates ?? []).map((c) => (
          <Button key={c.quote_request_id} size="xs" variant="outline" disabled={busy}
            onClick={() => resolve({ quote_request_id: c.quote_request_id }, `${c.company_name} に登録しました`)}>
            {c.company_name}（#Q-{c.quote_request_id}・{Math.round(c.score * 100)}%）
          </Button>
        ))}
        <Button size="xs" variant="ghost" className="text-muted-foreground" disabled={busy} onClick={() => resolve({ dismiss: true }, '対象外にしました')}>対象外</Button>
      </div>
      <div className="flex gap-1">
        <Input className="h-7 text-xs" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="候補にない場合: 店舗名で案件を検索" />
        <Button size="xs" variant="outline" onClick={search}><Search className="h-3 w-3" /></Button>
      </div>
      {results && (
        <div className="space-y-1">
          {results.length === 0 && <p className="text-xs text-muted-foreground">見つかりませんでした</p>}
          {results.map((d) => (
            <button key={d.id} type="button" disabled={busy}
              className="flex w-full items-center gap-2 rounded border px-2 py-1 text-left text-xs hover:bg-muted"
              onClick={() => resolve({ deal_id: d.id }, `${d.company_name} に登録しました`)}>
              <span className="font-medium">{d.company_name}</span><StageBadge stage={d.stage} />
              {d.owner_name && <span className="text-muted-foreground">{d.owner_name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
