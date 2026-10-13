'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { TASK_KINDS, TEMPERATURES, type TaskKind, type Temperature } from '@/lib/sfa/constants'
import { StageBadge } from '@/components/sfa/stage-badge'
import type { DealOverview } from '@/components/sfa/types'
import { useMembers } from '@/components/sfa/use-members'
import { api, DATE_PRESETS, selectClass, todayJst } from '@/components/sfa/utils'

interface ContainerRow { product: string; supplier: string; unit_price: string; price_note: string; monthly_qty: string }
const emptyRow = (): ContainerRow => ({ product: '', supplier: '', unit_price: '', price_note: '', monthly_qty: '' })

function Field({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={className ? `space-y-1 ${className}` : 'space-y-1'}>
      <Label>{label}{required && <span className="text-red-600"> *</span>}</Label>
      {children}
    </div>
  )
}

export default function NewDealPage() {
  const router = useRouter()
  const members = useMembers()
  const today = todayJst()

  const [company, setCompany] = useState({ name: '', phone: '', address: '', industry: '' })
  const [contact, setContact] = useState({ name: '', position: '', mobile: '', email: '', best_time: '' })
  const [temperature, setTemperature] = useState<Temperature | ''>('中')
  const [ownerId, setOwnerId] = useState('')
  const [tossedAt, setTossedAt] = useState(today)
  const [appointmentNote, setAppointmentNote] = useState('')
  const [hearing, setHearing] = useState('')
  const [containersText, setContainersText] = useState('')
  const [rows, setRows] = useState<ContainerRow[]>([])
  const [nextDue, setNextDue] = useState('')
  const [nextKind, setNextKind] = useState<TaskKind>('再架電')
  const [nextNote, setNextNote] = useState('')
  const [withQuote, setWithQuote] = useState(false)
  const [quoteNote, setQuoteNote] = useState('')
  const [quoteDue, setQuoteDue] = useState('')
  const [saving, setSaving] = useState(false)
  const [duplicates, setDuplicates] = useState<DealOverview[] | null>(null)

  const trimObj = <T extends Record<string, string>>(o: T) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.trim() || null]))

  async function submit(force = false) {
    if (!company.name.trim()) { toast.error('店舗名は必須です'); return }
    if (!nextDue) { toast.error('次のアクションの日付は必須です'); return }
    setSaving(true)
    try {
      const res = await api<{ deal_id: number }>('/api/sfa/deals', {
        method: 'POST',
        silent: true,
        json: {
          company: { ...trimObj(company), name: company.name.trim() },
          contact: trimObj(contact),
          temperature: temperature || null,
          owner_id: ownerId ? Number(ownerId) : null,
          tossed_at: tossedAt || null,
          appointment_note: appointmentNote.trim() || null,
          hearing: hearing.trim() || null,
          current_containers_text: containersText.trim() || null,
          containers: rows.filter((r) => r.product.trim()).map((r) => ({
            product: r.product.trim(),
            supplier: r.supplier.trim() || null,
            unit_price: r.unit_price ? Number(r.unit_price) : null,
            price_note: r.price_note.trim() || null,
            monthly_qty: r.monthly_qty.trim() || null,
          })),
          next: { due_on: nextDue, kind: nextKind, note: nextNote.trim() || null },
          request_quote: withQuote ? { note: quoteNote.trim() || null, due_on: quoteDue || null } : null,
          force,
        },
      })
      toast.success('アポを登録しました')
      router.push(`/sfa/deals/${res.deal_id}`)
    } catch (e) {
      const err = e as Error & { status?: number; data?: { duplicates?: DealOverview[] } }
      if (err.status === 409 && err.data?.duplicates) {
        setDuplicates(err.data.duplicates)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        toast.error(err.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const setRow = (i: number, k: keyof ContainerRow, v: string) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [k]: v } : r)))

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">アポ登録</h1>

      {duplicates && duplicates.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-900/20">
          <p className="flex items-center gap-1 font-medium text-amber-800 dark:text-amber-300"><AlertTriangle className="h-4 w-4" />同じ店舗の案件が既にあります</p>
          {duplicates.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2">
              <Link href={`/sfa/deals/${d.id}`} className="font-medium underline" target="_blank">#{d.id} {d.company_name}</Link>
              <StageBadge stage={d.stage} />
              {d.owner_name && <span className="text-xs text-muted-foreground">担当: {d.owner_name}</span>}
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setDuplicates(null)}>修正する</Button>
            <Button size="sm" onClick={() => submit(true)} disabled={saving}>別案件として登録</Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">店舗・先方担当者</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="会社名・店舗名" required className="sm:col-span-2">
            <Input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
          </Field>
          <Field label="電話番号（店舗）"><Input value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} /></Field>
          <Field label="業種"><Input value={company.industry} onChange={(e) => setCompany({ ...company, industry: e.target.value })} placeholder="例: 弁当・惣菜" /></Field>
          <Field label="住所" className="sm:col-span-2"><Input value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} /></Field>
          <Field label="担当者名"><Input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="例: 店長 山田様" /></Field>
          <Field label="役職"><Input value={contact.position} onChange={(e) => setContact({ ...contact, position: e.target.value })} /></Field>
          <Field label="携帯番号"><Input value={contact.mobile} onChange={(e) => setContact({ ...contact, mobile: e.target.value })} /></Field>
          <Field label="メール"><Input value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
          <Field label="連絡のつきやすい曜日・時間帯" className="sm:col-span-2">
            <Input value={contact.best_time} onChange={(e) => setContact({ ...contact, best_time: e.target.value })} placeholder="例: 平日14〜16時、月曜定休" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">アポ内容</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Field label="アポ獲得日"><Input type="date" value={tossedAt} onChange={(e) => setTossedAt(e.target.value)} /></Field>
          <Field label="関心度">
            <select className={selectClass} value={temperature} onChange={(e) => setTemperature(e.target.value as Temperature | '')}>
              <option value="">—</option>
              {TEMPERATURES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="対応担当">
            <select className={selectClass} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">自動（登録者）</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="先方の希望日時" className="sm:col-span-3">
            <Input value={appointmentNote} onChange={(e) => setAppointmentNote(e.target.value)} placeholder="例: 10/16（木）15:00頃" />
          </Field>
          <Field label="ヒアリングメモ" className="sm:col-span-3">
            <Textarea rows={4} value={hearing} onChange={(e) => setHearing(e.target.value)} placeholder="容器の悩み・関心事項など" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">使用中の容器・価格</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field label="自由記述（聞いたまま）">
            <Textarea rows={3} value={containersText} onChange={(e) => setContainersText(e.target.value)} placeholder="例: ガチ弁24-20A 17.6円/個 350〜400個/日 中田商事から" />
          </Field>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-6">
              <Input className="col-span-2" value={r.product} onChange={(e) => setRow(i, 'product', e.target.value)} placeholder="品名・型番" />
              <Input value={r.supplier} onChange={(e) => setRow(i, 'supplier', e.target.value)} placeholder="仕入先" />
              <Input type="number" step="0.01" value={r.unit_price} onChange={(e) => setRow(i, 'unit_price', e.target.value)} placeholder="単価(円/枚)" />
              <Input value={r.monthly_qty} onChange={(e) => setRow(i, 'monthly_qty', e.target.value)} placeholder="月の使用量" />
              <div className="flex gap-1">
                <Input value={r.price_note} onChange={(e) => setRow(i, 'price_note', e.target.value)} placeholder="価格メモ" />
                <Button variant="ghost" size="icon" onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
            <Plus className="h-3.5 w-3.5" />容器を1行追加（任意）
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">次のアクション <span className="text-red-600">*</span></CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {DATE_PRESETS.map((p) => {
              const v = p.calc(today)
              return <Button key={p.label} type="button" size="xs" variant={nextDue === v ? 'default' : 'outline'} onClick={() => setNextDue(v)}>{p.label}</Button>
            })}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
            <select className={selectClass} value={nextKind} onChange={(e) => setNextKind(e.target.value as TaskKind)}>
              {TASK_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <Input value={nextNote} onChange={(e) => setNextNote(e.target.value)} placeholder="メモ" />
          </div>

          <label className="flex items-center gap-2 pt-2 text-sm">
            <Switch checked={withQuote} onCheckedChange={(v) => setWithQuote(v)} />
            続けて見積作成を依頼する（見積書ルームに依頼が投稿されます）
          </label>
          {withQuote && (
            <div className="grid gap-2 sm:grid-cols-3">
              <Textarea className="sm:col-span-2" rows={2} value={quoteNote} onChange={(e) => setQuoteNote(e.target.value)} placeholder="依頼内容（対象容器・数量・条件など）" />
              <Field label="回答希望日"><Input type="date" value={quoteDue} onChange={(e) => setQuoteDue(e.target.value)} /></Field>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pb-6">
        <Button variant="outline" asChild><Link href="/sfa">キャンセル</Link></Button>
        <Button onClick={() => submit(false)} disabled={saving}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}登録する
        </Button>
      </div>
    </div>
  )
}
