'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Search, Plus, Pencil, Database, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

interface MasterRow {
  id: number
  maker_id: string | null
  maker_name: string | null
  code: string | null
  name: string
  material: string | null
  nyusu: number | null
  price_old: number | null
  price_new: number | null
  sell_price: number | null
  status: string | null
  note: string | null
  source: string | null
  active: boolean
  updated_at: string
}

interface Maker { id: string; name: string }

const PAGE_SIZE = 50

const emptyForm = {
  id: null as number | null,
  code: '', name: '', maker_id: '', nyusu: '', price_new: '', sell_price: '', status: '', note: '',
  active: true,
}

export default function QuoteMasterPage() {
  const [search, setSearch] = useState('')
  const [makerFilter, setMakerFilter] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [rows, setRows] = useState<MasterRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [makers, setMakers] = useState<Maker[]>([])

  // 編集ダイアログ
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [needsForce, setNeedsForce] = useState(false)

  const load = useCallback(async (pageArg: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (makerFilter) params.set('maker_id', makerFilter)
      if (includeInactive) params.set('include_inactive', 'true')
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(pageArg * PAGE_SIZE))
      const res = await fetch(`/api/quote/master?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '取得に失敗しました')
      setRows(data.rows || [])
      setTotal(data.total || 0)
      setPage(pageArg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [search, makerFilter, includeInactive])

  useEffect(() => {
    load(0)
    fetch('/api/quote/makers').then(r => r.json()).then(d => { if (Array.isArray(d)) setMakers(d) }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openNew() {
    setForm(emptyForm)
    setNeedsForce(false)
    setDialogOpen(true)
  }

  function openEdit(r: MasterRow) {
    setForm({
      id: r.id,
      code: r.code || '',
      name: r.name,
      maker_id: r.maker_id || '',
      nyusu: r.nyusu != null ? String(r.nyusu) : '',
      price_new: r.price_new != null ? String(r.price_new) : '',
      sell_price: r.sell_price != null ? String(r.sell_price) : '',
      status: r.status || '',
      note: r.note || '',
      active: r.active,
    })
    setNeedsForce(false)
    setDialogOpen(true)
  }

  async function handleSave(force = false) {
    if (!form.name.trim()) { toast.error('商品名は必須です'); return }
    if (!form.price_new || parseFloat(form.price_new) <= 0) { toast.error('新単価は0より大きい値を入力してください'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/quote/master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id,
          code: form.code.trim() || undefined,
          name: form.name.trim(),
          maker_id: form.maker_id || undefined,
          nyusu: form.nyusu ? parseInt(form.nyusu, 10) : undefined,
          price_new: parseFloat(form.price_new),
          sell_price: form.sell_price ? parseFloat(form.sell_price) : undefined,
          status: form.status.trim() || undefined,
          note: form.note.trim() || undefined,
          active: form.active,
          force,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '保存に失敗しました')
      if (data.result === 'blocked') {
        if (String(data.reason).includes('±50%')) {
          setNeedsForce(true)
          toast.warning(data.reason)
        } else {
          toast.error(data.reason)
        }
        return
      }
      toast.success(data.result === 'created' ? '登録しました' : '更新しました')
      setDialogOpen(false)
      load(page)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(r: MasterRow) {
    const action = r.active ? '廃番化' : '再有効化'
    try {
      const res = await fetch('/api/quote/master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, active: !r.active, status: r.active ? '廃番' : '再有効' }),
      })
      const data = await res.json()
      if (!res.ok || data.result === 'blocked') throw new Error(data.reason || data.error || `${action}に失敗しました`)
      toast.success(`「${r.name}」を${action}しました`)
      load(page)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${action}に失敗しました`)
    }
  }

  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Database className="h-6 w-6" />原価マスタ管理</h1>
          <p className="text-sm text-muted-foreground">
            見積りAIが参照する仕入原価データの整備画面。物理削除はできません（廃番化のみ）。全変更が履歴に記録されます。
          </p>
        </div>
        <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />新規登録</Button>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 flex-1 min-w-48">
              <Label>検索（商品名・型番・商品コード）</Label>
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="表記ゆれOK（例: BF-362 / bf362）"
                onKeyDown={e => e.key === 'Enter' && load(0)} />
            </div>
            <div className="space-y-1">
              <Label>メーカー</Label>
              <select value={makerFilter} onChange={e => setMakerFilter(e.target.value)}
                className="flex h-9 w-48 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                <option value="">すべて</option>
                {makers.map(m => <option key={m.id} value={m.id}>{m.id}: {m.name}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-1.5 text-sm pb-2 cursor-pointer">
              <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} className="h-4 w-4" />
              廃番も表示
            </label>
            <Button onClick={() => load(0)} disabled={loading}>
              {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}
              検索
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2">コード</th>
                  <th className="py-2 pr-2">商品名</th>
                  <th className="py-2 pr-2">メーカー</th>
                  <th className="py-2 pr-2 text-right">入数</th>
                  <th className="py-2 pr-2 text-right">仕入原価</th>
                  <th className="py-2 pr-2 text-right">通常売価</th>
                  <th className="py-2 pr-2">状態</th>
                  <th className="py-2 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={`border-b hover:bg-muted/50 ${!r.active ? 'opacity-50' : ''}`}>
                    <td className="py-1.5 pr-2 font-mono text-xs">{r.code}</td>
                    <td className="py-1.5 pr-2">{r.name}</td>
                    <td className="py-1.5 pr-2 text-xs">{r.maker_name}</td>
                    <td className="py-1.5 pr-2 text-right">{r.nyusu ?? '-'}</td>
                    <td className="py-1.5 pr-2 text-right font-mono">{r.price_new ?? '-'}</td>
                    <td className="py-1.5 pr-2 text-right font-mono">{r.sell_price ?? '-'}</td>
                    <td className="py-1.5 pr-2 text-xs">{!r.active ? '廃番(無効)' : r.status}</td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => toggleActive(r)}>
                        {r.active ? '廃番化' : '再有効化'}
                      </Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !loading && (
                  <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">データがありません</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total.toLocaleString()}件中 {total === 0 ? 0 : page * PAGE_SIZE + 1}〜{Math.min((page + 1) * PAGE_SIZE, total)}件</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => load(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= maxPage || loading} onClick={() => load(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 編集/新規ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={v => !saving && setDialogOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? '商品を編集' : '新規登録'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>商品コード</Label>
                <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>メーカー</Label>
                <select value={form.maker_id} onChange={e => setForm(f => ({ ...f, maker_id: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                  <option value="">未選択</option>
                  {makers.map(m => <option key={m.id} value={m.id}>{m.id}: {m.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>商品名 *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>入数</Label>
                <Input type="number" value={form.nyusu} onChange={e => setForm(f => ({ ...f, nyusu: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>仕入原価 *（社外秘）</Label>
                <Input type="number" step="0.01" value={form.price_new} onChange={e => setForm(f => ({ ...f, price_new: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>通常売価（任意）</Label>
                <Input type="number" step="0.01" value={form.sell_price} onChange={e => setForm(f => ({ ...f, sell_price: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>状態</Label>
                <Input value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} placeholder="改定 / 新規登録 / 廃番 等" />
              </div>
              <div className="space-y-1">
                <Label>備考</Label>
                <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            {needsForce && (
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                価格変動が±50%を超えています。値が正しいことを確認したら「強制適用で保存」を押してください。
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>キャンセル</Button>
            {needsForce ? (
              <Button variant="destructive" onClick={() => handleSave(true)} disabled={saving}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}強制適用で保存
              </Button>
            ) : (
              <Button onClick={() => handleSave(false)} disabled={saving}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}保存
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
