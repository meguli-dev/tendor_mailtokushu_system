'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Check, ChevronDown, ChevronRight, FileText, Loader2, PenLine, Pencil, Phone, Plus, Trash2, Upload, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { STAGES, TASK_KINDS, TEMPERATURES, type Stage, type TaskKind, type Temperature } from '@/lib/sfa/constants'
import { LogContactDialog } from '@/components/sfa/log-contact-dialog'
import { QuoteRequestDialog, QuoteUploadDialog, RevisionDialog } from '@/components/sfa/quote-dialogs'
import { QuoteStatusBadge, StageBadge } from '@/components/sfa/stage-badge'
import type { Container, DealDetail, Task } from '@/components/sfa/types'
import { QuoteContent } from '@/components/sfa/quote-content'
import { useMe, useMembers } from '@/components/sfa/use-members'
import { addDays, api, DATE_PRESETS, fmtDate, fmtDateTime, selectClass, telHref, todayJst } from '@/components/sfa/utils'
import { cn } from '@/lib/utils'

// ------------------------------------------------------------
// 小さな部品
// ------------------------------------------------------------
function EditableText({ label, value, onSave, rows = 3, placeholder }: {
  label: string; value: string | null; onSave: (v: string | null) => Promise<void>; rows?: number; placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {!editing && <Button variant="ghost" size="xs" onClick={() => { setText(value ?? ''); setEditing(true) }}><Pencil className="h-3 w-3" />編集</Button>}
      </div>
      {editing ? (
        <div className="space-y-1">
          <Textarea rows={rows} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
          <div className="flex justify-end gap-1">
            <Button size="xs" variant="outline" onClick={() => setEditing(false)}>キャンセル</Button>
            <Button size="xs" disabled={saving} onClick={async () => {
              setSaving(true)
              try { await onSave(text.trim() || null); setEditing(false) } finally { setSaving(false) }
            }}>{saving && <Loader2 className="h-3 w-3 animate-spin" />}保存</Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm">{value || <span className="text-muted-foreground">—</span>}</p>
      )}
    </div>
  )
}

function InfoField({ label, value, onSave, href }: {
  label: string; value: string | null; onSave: (v: string | null) => Promise<void>; href?: string
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value ?? '')
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      {editing ? (
        <div className="flex gap-1">
          <Input className="h-7" value={text} onChange={(e) => setText(e.target.value)} autoFocus
            onKeyDown={async (e) => { if (e.key === 'Enter') { await onSave(text.trim() || null); setEditing(false) } }} />
          <Button size="icon-sm" variant="ghost" onClick={async () => { await onSave(text.trim() || null); setEditing(false) }}><Check className="h-3.5 w-3.5" /></Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /></Button>
        </div>
      ) : (
        <button type="button" className="group flex min-h-7 items-center gap-1 text-left" onClick={() => { setText(value ?? ''); setEditing(true) }}>
          {value ? (href ? <a href={href} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{value}</a> : <span className="break-all">{value}</span>)
            : <span className="text-muted-foreground">—</span>}
          <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </button>
      )}
    </div>
  )
}

const SOURCE_LABEL: Record<string, string> = { ui: '管理画面', mcp: 'MCP', chatwork: 'Chatwork', import: '取込', system: 'システム' }

// ------------------------------------------------------------
// ページ
// ------------------------------------------------------------
export default function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const dealId = Number(id)
  const me = useMe()
  const members = useMembers()
  const [deal, setDeal] = useState<DealDetail | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [quoteReqOpen, setQuoteReqOpen] = useState(false)
  const [uploadFor, setUploadFor] = useState<number | null>(null)
  const [directUploadOpen, setDirectUploadOpen] = useState(false)
  const [revisionFor, setRevisionFor] = useState<number | null>(null)
  const [showLegacy, setShowLegacy] = useState(false)
  const [newTask, setNewTask] = useState<{ due_on: string; kind: TaskKind; note: string } | null>(null)
  const [newContainer, setNewContainer] = useState<Record<string, string> | null>(null)
  const [editContainer, setEditContainer] = useState<{ id: number; values: Record<string, string> } | null>(null)
  const today = todayJst()

  const load = useCallback(() =>
    api<DealDetail>(`/api/sfa/deals/${dealId}`, { silent: true })
      .then(setDeal)
      .catch((e: Error & { status?: number }) => {
        if (e.status === 404) setNotFound(true)
        else toast.error(e.message)
      }), [dealId])

  useEffect(() => { load() }, [load])

  async function patch(body: Record<string, unknown>, msg = '保存しました') {
    try {
      setDeal(await api<DealDetail>(`/api/sfa/deals/${dealId}`, { method: 'PATCH', json: body }))
      toast.success(msg)
    } catch { /* toast済み */ }
  }

  async function taskAction(body: Record<string, unknown>, msg: string) {
    try {
      await api(`/api/sfa/deals/${dealId}/tasks`, { method: 'POST', json: body })
      toast.success(msg)
      load()
    } catch { /* toast済み */ }
  }

  async function saveContainer(values: Record<string, string>, cid?: number) {
    if (!values.product?.trim()) { toast.error('品名・型番は必須です'); return }
    const body = {
      product: values.product.trim(),
      maker: values.maker?.trim() || null,
      supplier: values.supplier?.trim() || null,
      unit_price: values.unit_price ? Number(values.unit_price) : null,
      price_note: values.price_note?.trim() || null,
      monthly_qty: values.monthly_qty?.trim() || null,
    }
    try {
      if (cid) await api(`/api/sfa/containers/${cid}`, { method: 'PATCH', json: body })
      else await api(`/api/sfa/deals/${dealId}/containers`, { method: 'POST', json: body })
      setNewContainer(null)
      setEditContainer(null)
      toast.success('容器を保存しました')
      load()
    } catch { /* toast済み */ }
  }

  async function removeContainer(cid: number) {
    if (!confirm('この容器を削除しますか？')) return
    try {
      await api(`/api/sfa/containers/${cid}`, { method: 'DELETE' })
      load()
    } catch { /* toast済み */ }
  }

  async function cancelQuote(qid: number) {
    if (!confirm(`見積依頼 #Q-${qid} を取り消しますか？`)) return
    try {
      await api(`/api/sfa/quote-requests/${qid}`, { method: 'DELETE' })
      toast.success('取り消しました')
      load()
    } catch { /* toast済み */ }
  }

  if (notFound) return <p className="py-10 text-center text-muted-foreground">案件が見つかりません。<Link href="/sfa/deals" className="underline">一覧へ</Link></p>
  if (!deal) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  const contact = deal.contact
  const openTasks = deal.tasks.filter((t) => !t.done_at)
  const doneTasks = deal.tasks.filter((t) => t.done_at)
  const canUpload = !!me && (me.is_quote_maker || me.role === 'admin')
  const isOpen = deal.stage !== '受注' && deal.stage !== '失注'
  const tel = contact?.mobile || deal.company.phone

  const containerEditor = (values: Record<string, string>, set: (v: Record<string, string>) => void, onSave: () => void, onCancel: () => void) => (
    <div className="grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-3">
      <Input className="col-span-2 sm:col-span-3" value={values.product ?? ''} onChange={(e) => set({ ...values, product: e.target.value })} placeholder="品名・型番 *" />
      <Input value={values.maker ?? ''} onChange={(e) => set({ ...values, maker: e.target.value })} placeholder="メーカー" />
      <Input value={values.supplier ?? ''} onChange={(e) => set({ ...values, supplier: e.target.value })} placeholder="仕入先" />
      <Input type="number" step="0.01" value={values.unit_price ?? ''} onChange={(e) => set({ ...values, unit_price: e.target.value })} placeholder="単価(円/枚)" />
      <Input value={values.price_note ?? ''} onChange={(e) => set({ ...values, price_note: e.target.value })} placeholder="価格メモ（原文）" />
      <Input value={values.monthly_qty ?? ''} onChange={(e) => set({ ...values, monthly_qty: e.target.value })} placeholder="月の使用量" />
      <div className="flex justify-end gap-1">
        <Button size="xs" variant="outline" onClick={onCancel}>キャンセル</Button>
        <Button size="xs" onClick={onSave}>保存</Button>
      </div>
    </div>
  )

  const toValues = (c: Container): Record<string, string> => ({
    product: c.product, maker: c.maker ?? '', supplier: c.supplier ?? '', unit_price: c.unit_price?.toString() ?? '',
    price_note: c.price_note ?? '', monthly_qty: c.monthly_qty ?? '',
  })

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="space-y-2">
        <Link href="/sfa/deals" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"><ArrowLeft className="h-3 w-3" />案件一覧</Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold sm:text-2xl">{deal.company.name}</h1>
          <StageBadge stage={deal.stage} />
          <span className="text-xs text-muted-foreground">#{deal.id}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select className={cn(selectClass, 'h-8 w-32')} value={deal.stage} onChange={(e) => patch({ stage: e.target.value as Stage }, '段階を変更しました')}>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={cn(selectClass, 'h-8 w-24')} value={deal.temperature ?? ''} onChange={(e) => patch({ temperature: (e.target.value || null) as Temperature | null })}>
            <option value="">温度—</option>
            {TEMPERATURES.map((t) => <option key={t} value={t}>温度{t}</option>)}
          </select>
          <select className={cn(selectClass, 'h-8 w-36')} value={deal.owner_id ?? ''} onChange={(e) => patch({ owner_id: e.target.value ? Number(e.target.value) : null }, '対応担当を変更しました')}>
            <option value="">担当未割当</option>
            {members.map((m) => <option key={m.id} value={m.id}>担当: {m.name}</option>)}
          </select>
          {tel && <Button variant="outline" size="sm" asChild><a href={telHref(tel)}><Phone className="h-3.5 w-3.5" />{tel}</a></Button>}
          {isOpen && <Button size="sm" onClick={() => setLogOpen(true)}><PenLine className="h-3.5 w-3.5" />結果を記録</Button>}
        </div>
        <p className="text-xs text-muted-foreground">
          アポ獲得 {fmtDate(deal.tossed_at)}{deal.tossed_by?.name || deal.tossed_by_name ? `（${deal.tossed_by?.name ?? deal.tossed_by_name}）` : ''}
          {deal.appointment_note && ` ／ 希望日時: ${deal.appointment_note}`}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* 左カラム */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">次のアクション</CardTitle>
              <Button size="xs" variant="outline" onClick={() => setNewTask({ due_on: addDays(today, 1), kind: '再架電', note: '' })}><Plus className="h-3 w-3" />追加</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {openTasks.length === 0 && !newTask && (
                <p className={cn('text-sm', isOpen ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground')}>
                  {isOpen ? '次回予定がありません。結果を記録するか、予定を追加してください。' : '終了した案件です'}
                </p>
              )}
              {openTasks.map((t) => <TaskRow key={t.id} task={t} today={today} onAction={taskAction} />)}
              {newTask && (
                <div className="space-y-2 rounded-md border p-2">
                  <div className="flex flex-wrap gap-1">
                    {DATE_PRESETS.map((p) => <Button key={p.label} size="xs" variant="outline" onClick={() => setNewTask({ ...newTask, due_on: p.calc(today) })}>{p.label}</Button>)}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input type="date" value={newTask.due_on} onChange={(e) => setNewTask({ ...newTask, due_on: e.target.value })} />
                    <select className={selectClass} value={newTask.kind} onChange={(e) => setNewTask({ ...newTask, kind: e.target.value as TaskKind })}>
                      {TASK_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <Input value={newTask.note} onChange={(e) => setNewTask({ ...newTask, note: e.target.value })} placeholder="メモ" />
                  </div>
                  <div className="flex justify-end gap-1">
                    <Button size="xs" variant="outline" onClick={() => setNewTask(null)}>キャンセル</Button>
                    <Button size="xs" onClick={async () => {
                      await taskAction({ action: 'create', next: { due_on: newTask.due_on, kind: newTask.kind, note: newTask.note.trim() || null } }, '予定を追加しました')
                      setNewTask(null)
                    }}>追加</Button>
                  </div>
                </div>
              )}
              {doneTasks.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">完了済み {doneTasks.length}件</summary>
                  <ul className="mt-1 space-y-0.5">
                    {doneTasks.map((t) => <li key={t.id}>✓ {fmtDate(t.due_on)} {t.kind}{t.note && `：${t.note}`}（{fmtDateTime(t.done_at)}完了）</li>)}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">接触履歴</CardTitle>
              {isOpen && <Button size="xs" onClick={() => setLogOpen(true)}><PenLine className="h-3 w-3" />結果を記録</Button>}
            </CardHeader>
            <CardContent>
              {deal.activities.length === 0 ? <p className="text-sm text-muted-foreground">履歴はまだありません</p> : (
                <ol className="space-y-2 border-l pl-4">
                  {deal.activities.map((a) => (
                    <li key={a.id} className="relative text-sm">
                      <span className={cn('absolute -left-[21px] top-1.5 h-2 w-2 rounded-full',
                        a.kind === '不在' ? 'bg-zinc-400' : a.kind === 'ステータス変更' ? 'bg-sky-500' : a.kind === '見積提示' ? 'bg-indigo-500' : 'bg-primary')} />
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{a.occurred_on ? fmtDate(a.occurred_on) : '日付不明'}</span>
                        <span className="rounded bg-muted px-1">{a.kind}</span>
                        {a.member?.name && <span>{a.member.name}</span>}
                        {a.source !== 'ui' && <span>[{SOURCE_LABEL[a.source] ?? a.source}]</span>}
                      </div>
                      {a.body && <p className="whitespace-pre-wrap">{a.body}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右カラム */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">見積</CardTitle>
              <div className="flex gap-1">
                {canUpload && <Button size="xs" variant="outline" onClick={() => setDirectUploadOpen(true)}><Upload className="h-3 w-3" />見積書を登録</Button>}
                {isOpen && <Button size="xs" onClick={() => setQuoteReqOpen(true)}><Plus className="h-3 w-3" />見積作成を依頼</Button>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {deal.quote_requests.length === 0 && <p className="text-sm text-muted-foreground">見積依頼はありません</p>}
              {deal.quote_requests.map((q) => (
                <div key={q.id} className={cn('space-y-2 rounded-md border p-2 text-sm', q.status === '取消' && 'opacity-60')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">#Q-{q.id}</span>
                    <QuoteStatusBadge status={q.status} />
                    <span className="text-xs text-muted-foreground">依頼 {fmtDate(q.requested_at.slice(0, 10))}{q.requested_by && `（${q.requested_by.name}）`}</span>
                    {q.due_on && <span className="text-xs text-amber-700 dark:text-amber-400">希望 {fmtDate(q.due_on)}</span>}
                  </div>
                  {q.request_note && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{q.request_note}</p>}
                  {q.files.length > 0 && (
                    <ul className="space-y-1">
                      {q.files.map((f, i) => (
                        <li key={f.id} className="flex flex-wrap items-center gap-2 text-xs">
                          <a href={`/api/sfa/quote-files/${f.id}`} target="_blank" rel="noreferrer" className={cn('inline-flex items-center gap-1 hover:underline', i === 0 ? 'font-medium text-primary' : 'text-muted-foreground')}>
                            <FileText className="h-3.5 w-3.5" />第{f.version}版 {f.file_name}
                          </a>
                          <span className="text-muted-foreground">{fmtDateTime(f.uploaded_at)}・{SOURCE_LABEL[f.source] ?? f.source}</span>
                          {f.note && <span className="text-muted-foreground">／{f.note}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {q.files[0] && <QuoteContent file={q.files[0]} canEdit={canUpload} onSaved={load} />}
                  {q.status !== '取消' && (
                    <div className="flex flex-wrap gap-1">
                      {canUpload && <Button size="xs" variant="outline" onClick={() => setUploadFor(q.id)}><Upload className="h-3 w-3" />見積書をアップロード</Button>}
                      {q.files.length > 0 && <Button size="xs" variant="outline" onClick={() => setRevisionFor(q.id)}>修正依頼</Button>}
                      {['依頼中', '作成中', '修正依頼'].includes(q.status) && (
                        <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => cancelQuote(q.id)}>取消</Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">検討状況</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <EditableText label="何を検討しているか" value={deal.considering} rows={2} onSave={(v) => patch({ considering: v })} />
              <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground">回答予定日</span>
                <Input type="date" className="h-8 w-44" value={deal.answer_due ?? ''} onChange={(e) => patch({ answer_due: e.target.value || null }, '回答予定日を保存しました')} />
              </div>
              {deal.stage === '失注' && <EditableText label="失注理由" value={deal.lost_reason} rows={2} onSave={(v) => patch({ lost_reason: v })} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">店舗・担当者</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <InfoField label="店舗名" value={deal.company.name} onSave={async (v) => { if (v) await patch({ company: { name: v } }) }} />
              <InfoField label="電話（店舗）" value={deal.company.phone} href={telHref(deal.company.phone)} onSave={(v) => patch({ company: { phone: v } })} />
              <InfoField label="住所" value={deal.company.address} onSave={(v) => patch({ company: { address: v } })} />
              <InfoField label="業種" value={deal.company.industry} onSave={(v) => patch({ company: { industry: v } })} />
              <InfoField label="容器なび会員ID" value={deal.company.bcart_customer_id} onSave={(v) => patch({ company: { bcart_customer_id: v } })} />
              <div className="my-2 border-t" />
              <InfoField label="担当者" value={contact?.name ?? null} onSave={(v) => patch({ contact: { id: contact?.id, name: v } })} />
              <InfoField label="役職" value={contact?.position ?? null} onSave={(v) => patch({ contact: { id: contact?.id, position: v } })} />
              <InfoField label="携帯" value={contact?.mobile ?? null} href={telHref(contact?.mobile)} onSave={(v) => patch({ contact: { id: contact?.id, mobile: v } })} />
              <InfoField label="メール" value={contact?.email ?? null} href={contact?.email ? `mailto:${contact.email}` : undefined} onSave={(v) => patch({ contact: { id: contact?.id, email: v } })} />
              <InfoField label="都合のよい時間" value={contact?.best_time ?? null} onSave={(v) => patch({ contact: { id: contact?.id, best_time: v } })} />
              {deal.contacts.length > 1 && (
                <p className="pt-1 text-xs text-muted-foreground">他の担当者: {deal.contacts.filter((c) => c.id !== contact?.id).map((c) => c.name).filter(Boolean).join('、')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">アポ時ヒアリング・使用中容器</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <EditableText label="ヒアリングメモ" value={deal.hearing} onSave={(v) => patch({ hearing: v })} />
              <EditableText label="使用中容器（自由記述）" value={deal.current_containers_text} rows={5} onSave={(v) => patch({ current_containers_text: v })} />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">使用中容器（明細）</Label>
                  <Button size="xs" variant="outline" onClick={() => setNewContainer({})}><Plus className="h-3 w-3" />追加</Button>
                </div>
                {deal.containers.length === 0 && !newContainer && <p className="text-xs text-muted-foreground">明細はまだありません</p>}
                {deal.containers.map((c) => editContainer?.id === c.id
                  ? <div key={c.id}>{containerEditor(editContainer.values, (v) => setEditContainer({ id: c.id, values: v }), () => saveContainer(editContainer.values, c.id), () => setEditContainer(null))}</div>
                  : (
                    <div key={c.id} className="flex items-start gap-2 rounded-md border p-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{c.product}{c.maker && <span className="font-normal text-muted-foreground">（{c.maker}）</span>}</p>
                        <p className="text-muted-foreground">
                          {[c.unit_price != null && `${c.unit_price}円/枚`, c.price_note, c.supplier && `仕入先: ${c.supplier}`, c.monthly_qty && `月 ${c.monthly_qty}`].filter(Boolean).join('　')}
                        </p>
                      </div>
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditContainer({ id: c.id, values: toValues(c) })}><Pencil className="h-3 w-3" /></Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => removeContainer(c.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                {newContainer && containerEditor(newContainer, setNewContainer, () => saveContainer(newContainer), () => setNewContainer(null))}
              </div>
            </CardContent>
          </Card>

          {deal.legacy && (
            <Card>
              <CardHeader>
                <button type="button" className="flex items-center gap-1 text-left text-sm font-medium" onClick={() => setShowLegacy(!showLegacy)}>
                  {showLegacy ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}取込元の原文（トスアップ管理表）
                </button>
              </CardHeader>
              {showLegacy && (
                <CardContent className="space-y-2">
                  {Object.entries(deal.legacy).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}>
                      <p className="text-xs text-muted-foreground">{k}</p>
                      <p className="whitespace-pre-wrap text-xs">{v}</p>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          )}
        </div>
      </div>

      <LogContactDialog
        target={{ id: deal.id, company_name: deal.company.name, stage: deal.stage, temperature: deal.temperature }}
        open={logOpen} onOpenChange={setLogOpen} onSaved={load}
      />
      <QuoteRequestDialog dealId={deal.id} open={quoteReqOpen} onOpenChange={setQuoteReqOpen} onSaved={load} />
      <QuoteUploadDialog quoteRequestId={uploadFor} title={deal.company.name} open={uploadFor !== null} onOpenChange={(o) => { if (!o) setUploadFor(null) }} onSaved={load} />
      <QuoteUploadDialog quoteRequestId={null} dealId={deal.id} title={deal.company.name} open={directUploadOpen} onOpenChange={setDirectUploadOpen} onSaved={load} />
      <RevisionDialog quoteRequestId={revisionFor} open={revisionFor !== null} onOpenChange={(o) => { if (!o) setRevisionFor(null) }} onSaved={load} />
    </div>
  )
}

function TaskRow({ task, today, onAction }: {
  task: Task; today: string; onAction: (body: Record<string, unknown>, msg: string) => Promise<void>
}) {
  const [moving, setMoving] = useState(false)
  const [due, setDue] = useState(task.due_on)
  const overdue = task.due_on < today
  return (
    <div className={cn('rounded-md border p-2 text-sm', overdue && 'border-red-300 dark:border-red-900')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('font-medium', overdue && 'text-red-600 dark:text-red-400')}>{fmtDate(task.due_on)}{task.due_time && ` ${task.due_time.slice(0, 5)}`}</span>
        <span className="rounded bg-muted px-1 text-xs">{task.kind}</span>
        {task.assignee && <span className="text-xs text-muted-foreground">{task.assignee.name}</span>}
        <div className="ml-auto flex gap-1">
          <Button size="xs" variant="outline" onClick={() => setMoving(!moving)}>日程変更</Button>
          <Button size="xs" variant="outline" onClick={() => onAction({ action: 'complete', task_id: task.id }, '完了にしました')}><Check className="h-3 w-3" />完了</Button>
        </div>
      </div>
      {task.note && <p className="text-xs text-muted-foreground">{task.note}</p>}
      {moving && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {DATE_PRESETS.map((p) => <Button key={p.label} size="xs" variant="ghost" onClick={() => setDue(p.calc(today))}>{p.label}</Button>)}
          <Input type="date" className="h-7 w-40" value={due} onChange={(e) => setDue(e.target.value)} />
          <Button size="xs" onClick={async () => { await onAction({ action: 'reschedule', task_id: task.id, next: { due_on: due } }, '日程を変更しました'); setMoving(false) }}>保存</Button>
        </div>
      )}
    </div>
  )
}
