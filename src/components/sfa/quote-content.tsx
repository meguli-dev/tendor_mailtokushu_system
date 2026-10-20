'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { QuoteFile, QuoteParseStatus } from './types'

const yen = (n: number | null | undefined) => (n === null || n === undefined ? '-' : Number(n).toLocaleString())

const STATUS: Record<QuoteParseStatus, { label: string; className: string } | null> = {
  none: null,
  parsed: { label: '自動読取', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300' },
  needs_review: { label: '要確認', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  failed: { label: '読取失敗', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  confirmed: { label: '確定', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
}

async function call(url: string, method: 'PUT' | 'POST', body?: unknown) {
  const res = await fetch(url, {
    method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || '処理に失敗しました')
  return data
}

/** 見積書（版）の中身。canEdit=テンドールまたは管理者 */
export function QuoteContent({ file, canEdit, onSaved }: { file: QuoteFile; canEdit: boolean; onSaved?: () => void }) {
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const st = STATUS[file.parse_status]
  const lines = file.lines ?? []

  async function reparse() {
    setBusy(true)
    try {
      const r = (await call(`/api/sfa/quote-files/${file.id}/content`, 'POST')) as { lines: number; status: string }
      toast.success(`読み取り直しました（${r.lines}行）`)
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '読み取りに失敗しました')
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    setBusy(true)
    try {
      await call(`/api/sfa/quote-files/${file.id}/content`, 'PUT', {
        total_amount: file.total_amount, lines: lines.map(({ code, product, qty, unit_price, amount }) => ({ code, product, qty, unit_price, amount })),
      })
      toast.success('見積内容を確定しました')
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '確定に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  if (file.parse_status === 'none' && !lines.length) {
    if (!canEdit || !/\.pdf$/i.test(file.file_name)) return null
    return (
      <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={reparse} disabled={busy}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}明細を読み取る
      </Button>
    )
  }

  return (
    <div className="space-y-1 rounded border bg-muted/30 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {st && <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', st.className)}>{st.label}</span>}
        {file.quote_no && <span className="text-muted-foreground">No.{file.quote_no}</span>}
        {file.issued_on && <span className="text-muted-foreground">{file.issued_on.replaceAll('-', '/')}</span>}
        {file.issuer_person && <span className="text-muted-foreground">担当 {file.issuer_person}</span>}
      </div>
      {file.parse_note && <p className="text-amber-700 dark:text-amber-400">{file.parse_note}</p>}
      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem]">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-1 text-left font-normal">商品名</th>
                <th className="py-1 text-right font-normal">入数</th>
                <th className="py-1 text-right font-normal">単価</th>
                <th className="py-1 text-right font-normal">金額</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id ?? l.line_no} className={cn('border-b last:border-0', l.check_ok === false && 'text-amber-700 dark:text-amber-400')}>
                  <td className="py-1 pr-2">{l.product}</td>
                  <td className="py-1 text-right tabular-nums">{yen(l.qty)}</td>
                  <td className="py-1 text-right tabular-nums">{yen(l.unit_price)}</td>
                  <td className="py-1 text-right tabular-nums">{yen(l.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={3} className="pt-1 text-right text-muted-foreground">合計（税抜）</td><td className="pt-1 text-right font-medium tabular-nums">{yen(file.total_amount)}</td></tr>
            </tfoot>
          </table>
        </div>
      )}
      {(file.valid_note || file.remarks) && (
        <p className="text-muted-foreground">{[file.valid_note && `有効期限：${file.valid_note}`, file.remarks].filter(Boolean).join('　')}</p>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-1 pt-1">
          {file.parse_status !== 'confirmed' && lines.length > 0 && (
            <Button size="xs" variant="outline" onClick={confirm} disabled={busy}>この内容で確定</Button>
          )}
          <Button size="xs" variant="outline" onClick={() => setEditOpen(true)} disabled={busy}>明細を直す</Button>
          {/\.pdf$/i.test(file.file_name) && (
            <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={reparse} disabled={busy}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}読み取り直す
            </Button>
          )}
        </div>
      )}
      <QuoteLinesDialog file={file} open={editOpen} onOpenChange={setEditOpen} onSaved={onSaved} />
    </div>
  )
}

type Row = { product: string; qty: string; unit_price: string; amount: string }
const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')))

function QuoteLinesDialog({ file, open, onOpenChange, onSaved }: {
  file: QuoteFile; open: boolean; onOpenChange: (o: boolean) => void; onSaved?: () => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    const src = file.lines ?? []
    setRows(src.length
      ? src.map((l) => ({ product: l.product, qty: l.qty?.toString() ?? '', unit_price: l.unit_price?.toString() ?? '', amount: l.amount?.toString() ?? '' }))
      : [{ product: '', qty: '', unit_price: '', amount: '' }])
    setTotal(file.total_amount?.toString() ?? '')
  }, [open, file])

  const set = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const sum = rows.reduce((s, r) => {
    const a = toNum(r.amount) ?? ((toNum(r.qty) ?? NaN) * (toNum(r.unit_price) ?? NaN))
    return s + (Number.isFinite(a) ? Math.round(a) : 0)
  }, 0)

  async function save() {
    const lines = rows.filter((r) => r.product.trim()).map((r) => ({
      product: r.product.trim(), qty: toNum(r.qty), unit_price: toNum(r.unit_price), amount: toNum(r.amount),
    }))
    if (lines.some((l) => [l.qty, l.unit_price, l.amount].some((n) => n !== null && !Number.isFinite(n)))) {
      toast.error('数値の欄に数字以外が入っています'); return
    }
    setSaving(true)
    try {
      await call(`/api/sfa/quote-files/${file.id}/content`, 'PUT', { total_amount: toNum(total) ?? sum, lines })
      toast.success('見積内容を確定しました')
      onOpenChange(false)
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>見積明細を直す（第{file.version}版）</DialogTitle>
          <DialogDescription>金額を空にすると 入数×単価 で計算します。保存すると「確定」になります。</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          <div className="grid grid-cols-[1fr_5rem_5rem_6rem_2rem] gap-1 text-xs text-muted-foreground">
            <span>商品名・摘要</span><span>入数</span><span>単価</span><span>金額</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_5rem_6rem_2rem] gap-1">
              <Input value={r.product} onChange={(e) => set(i, 'product', e.target.value)} />
              <Input inputMode="decimal" value={r.qty} onChange={(e) => set(i, 'qty', e.target.value)} />
              <Input inputMode="decimal" value={r.unit_price} onChange={(e) => set(i, 'unit_price', e.target.value)} />
              <Input inputMode="decimal" value={r.amount} onChange={(e) => set(i, 'amount', e.target.value)} />
              <Button size="icon" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="行を削除"><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button size="xs" variant="outline" onClick={() => setRows((rs) => [...rs, { product: '', qty: '', unit_price: '', amount: '' }])}>
            <Plus className="h-3 w-3" />行を追加
          </Button>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Label className="text-xs">合計（税抜）</Label>
            <Input className="w-32" inputMode="decimal" value={total} placeholder={sum.toLocaleString()} onChange={(e) => setTotal(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}確定する</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
