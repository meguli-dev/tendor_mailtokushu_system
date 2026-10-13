'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { STAGES, type Stage } from '@/lib/sfa/constants'
import { DealRow } from '@/components/sfa/deal-row'
import { LogContactDialog } from '@/components/sfa/log-contact-dialog'
import { StageBadge, TempMark } from '@/components/sfa/stage-badge'
import type { DealOverview } from '@/components/sfa/types'
import { useMembers } from '@/components/sfa/use-members'
import { api, fmtDate, selectClass, todayJst } from '@/components/sfa/utils'
import { cn } from '@/lib/utils'

export default function DealsPage() {
  const members = useMembers()
  const [q, setQ] = useState('')
  const [stages, setStages] = useState<Stage[]>([])
  const [open, setOpen] = useState<'1' | '0' | ''>('1')
  const [owner, setOwner] = useState('')
  const [deals, setDeals] = useState<DealOverview[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [logTarget, setLogTarget] = useState<DealOverview | null>(null)
  const today = todayJst()

  const load = useCallback(async () => {
    setLoading(true)
    const sp = new URLSearchParams()
    if (q.trim()) sp.set('q', q.trim())
    if (stages.length) sp.set('stage', stages.join(','))
    if (open) sp.set('open', open)
    if (owner) sp.set('owner', owner)
    try {
      setDeals(await api<DealOverview[]>(`/api/sfa/deals?${sp}`))
    } catch {
      setDeals([])
    } finally {
      setLoading(false)
    }
    // q は検索ボタン/Enterで反映するため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, open, owner])

  useEffect(() => { load() }, [load])

  const toggleStage = (s: Stage) => setStages((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">案件一覧</h1>
        <Button size="sm" asChild>
          <Link href="/sfa/deals/new"><Plus className="h-3.5 w-3.5" />アポ登録</Link>
        </Button>
      </div>

      <div className="space-y-2 rounded-lg border bg-background p-3">
        <div className="flex flex-wrap gap-2">
          <div className="flex min-w-[220px] flex-1 gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="店舗名・担当者名・電話番号" />
            <Button variant="outline" onClick={load}><Search className="h-4 w-4" /></Button>
          </div>
          <select className={cn(selectClass, 'w-28')} value={open} onChange={(e) => setOpen(e.target.value as '1' | '0' | '')}>
            <option value="1">進行中</option>
            <option value="0">終了</option>
            <option value="">すべて</option>
          </select>
          <select className={cn(selectClass, 'w-32')} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">全担当</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1">
          {STAGES.map((s) => (
            <button key={s} type="button" onClick={() => toggleStage(s)}
              className={cn('rounded-full border px-2 py-0.5 text-xs', stages.includes(s) ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
              {s}
            </button>
          ))}
          {stages.length > 0 && <button type="button" className="px-2 text-xs text-muted-foreground underline" onClick={() => setStages([])}>クリア</button>}
        </div>
      </div>

      {loading && !deals && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {deals && (
        <>
          <p className="text-xs text-muted-foreground">{deals.length}件{loading && ' （更新中…）'}</p>
          {/* PC: テーブル */}
          <div className="hidden rounded-lg border bg-background md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>店舗</TableHead>
                  <TableHead>段階</TableHead>
                  <TableHead>担当</TableHead>
                  <TableHead>次回</TableHead>
                  <TableHead>最終接触</TableHead>
                  <TableHead>アポ日</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((d) => (
                  <TableRow key={d.id}>
                    {/* 店舗名は折り返して2行まで（長い店名が隣の列に重ならないように） */}
                    <TableCell className="w-[260px] min-w-[180px] whitespace-normal">
                      <Link href={`/sfa/deals/${d.id}`} title={d.company_name} className="line-clamp-2 break-all font-medium hover:underline">{d.company_name}</Link>
                      <div><TempMark temperature={d.temperature} /></div>
                    </TableCell>
                    <TableCell><StageBadge stage={d.stage} /></TableCell>
                    <TableCell className="text-xs">{d.owner_name}</TableCell>
                    <TableCell className={cn('text-xs', d.is_open && d.next_due_on && d.next_due_on < today && 'font-medium text-red-600 dark:text-red-400')}>
                      {d.next_due_on ? `${fmtDate(d.next_due_on)} ${d.next_kind ?? ''}` : d.is_open ? <span className="text-orange-600 dark:text-orange-400">未設定</span> : ''}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div className="max-w-[260px] truncate" title={d.last_contact_body ?? undefined}>
                        {d.last_contact_on && `${fmtDate(d.last_contact_on)} ${d.last_contact_body ?? ''}`}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{fmtDate(d.tossed_at)}</TableCell>
                    <TableCell>
                      {d.is_open && <Button size="xs" variant="outline" onClick={() => setLogTarget(d)}>記録</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* スマホ: カード */}
          <div className="space-y-2 md:hidden">
            {deals.map((d) => <DealRow key={d.id} deal={d} onLog={d.is_open ? setLogTarget : undefined} />)}
          </div>
        </>
      )}

      <LogContactDialog target={logTarget} open={!!logTarget} onOpenChange={(o) => { if (!o) setLogTarget(null) }} onSaved={load} />
    </div>
  )
}
