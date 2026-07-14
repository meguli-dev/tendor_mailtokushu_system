'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Search, Calculator, Plus, X, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface Candidate {
  code: string
  name: string
  maker: string
  nyusu: number | null
  status: string | null
  match_type: string
  score: number
  cost_price: number | null
  floor_price: number | null
  sell_price: number | null
  freight_fee: number | null
  motobarai: string | null
  verdict: string | null
  tokune_range: { min: number; max: number } | null
}

interface QuoteResult {
  items: Array<{ code: string; name: string; maker: string; nyusu: number | null; cost_price: number; floor_price: number; status: string | null }>
  mode: string
  margin_rate: number
  qty_cases: number
  unit_price: number | null
  case_price: number | null
  total: number | null
  cost_price_set: number
  floor_price_set: number
  calc_steps: string[]
  warnings: string[]
  error?: string
}

const VERDICT_STYLE: Record<string, string> = {
  '勝ち': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  '戦える': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  '負け': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
}

export default function QuotePage() {
  // 検索・診断
  const [searchQ, setSearchQ] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)

  // 見積もり計算
  const [items, setItems] = useState<string[]>([''])
  const [qty, setQty] = useState(1)
  const [mode, setMode] = useState<'own' | 'direct' | 'bara'>('own')
  const [pref, setPref] = useState('')
  const [isCalculating, setIsCalculating] = useState(false)
  const [quote, setQuote] = useState<QuoteResult | null>(null)

  async function handleSearch() {
    if (!searchQ.trim()) { toast.error('型番または商品名を入力してください'); return }
    setIsSearching(true)
    setCandidates(null)
    try {
      const res = await fetch('/api/quote/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: searchQ.trim(),
          current_price: currentPrice ? parseFloat(currentPrice) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '検索に失敗しました')
      setCandidates(data.candidates || [])
      if ((data.candidates || []).length === 0) toast.info('一致する商品が見つかりませんでした')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '検索に失敗しました')
    } finally {
      setIsSearching(false)
    }
  }

  async function handleCalc() {
    const validItems = items.map(i => i.trim()).filter(Boolean)
    if (validItems.length === 0) { toast.error('品目を入力してください'); return }
    setIsCalculating(true)
    setQuote(null)
    try {
      const res = await fetch('/api/quote/calc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: validItems, qty, mode, pref: pref || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '計算に失敗しました')
      if (data.error) { toast.error(data.error); return }
      setQuote(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '計算に失敗しました')
    } finally {
      setIsCalculating(false)
    }
  }

  function addToQuote(name: string) {
    setItems(prev => {
      const empty = prev.findIndex(i => !i.trim())
      if (empty >= 0) {
        const next = [...prev]
        next[empty] = name
        return next
      }
      if (prev.length >= 5) { toast.error('セットは最大5品目までです'); return prev }
      return [...prev, name]
    })
    toast.success('見積もり計算に追加しました')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">見積りAI</h1>
        <p className="text-sm text-muted-foreground">
          容器の検索・勝ち負け診断と見積もり計算。原価・下限売価は社外秘です — 顧客に提示しないでください。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 検索・診断 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" />検索・勝ち負け診断</CardTitle>
            <CardDescription>表記ゆれ（全角半角・ハイフン等）は自動で吸収されます</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>型番・商品名</Label>
                <Input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                  placeholder="例: BF-362 / Kランチ52Sムジ"
                  onKeyDown={e => e.key === 'Enter' && handleSearch()} />
              </div>
              <div className="space-y-1">
                <Label>現在価格（円/枚）</Label>
                <Input type="number" value={currentPrice} onChange={e => setCurrentPrice(e.target.value)} placeholder="任意" />
              </div>
            </div>
            <Button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />検索中...</> : <><Search className="mr-1 h-4 w-4" />検索</>}
            </Button>

            {candidates && candidates.length > 0 && (
              <div className="space-y-2">
                {candidates.map((c, i) => (
                  <div key={`${c.code}-${i}`} className="rounded-lg border p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{c.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.verdict && (
                          <span className={`rounded px-2 py-0.5 text-xs font-bold ${VERDICT_STYLE[c.verdict] || ''}`}>{c.verdict}</span>
                        )}
                        <Button variant="outline" size="sm" onClick={() => addToQuote(c.name)}>
                          <Plus className="h-3 w-3" />見積へ
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.maker} / 入数{c.nyusu ?? '-'} / {c.match_type === 'exact' ? '完全一致' : c.match_type === 'prefix' ? '前方一致' : `類似 ${Math.round(c.score * 100)}%`}
                      {c.status && c.status !== '改定' && <span className="ml-1 text-orange-600">［{c.status}］</span>}
                    </div>
                    <div className="text-xs">
                      <span className="text-muted-foreground">仕入原価 </span><span className="font-mono">{c.cost_price}円</span>
                      <span className="text-muted-foreground ml-2">下限売価 </span><span className="font-mono">{c.floor_price}円</span>
                      {c.tokune_range && (
                        <span className="ml-2 text-yellow-700 dark:text-yellow-400">特値レンジ {c.tokune_range.min}〜{c.tokune_range.max}円</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {candidates && candidates.length === 0 && (
              <p className="text-sm text-muted-foreground">一致する商品が見つかりませんでした</p>
            )}
          </CardContent>
        </Card>

        {/* 見積もり計算 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" />見積もり計算</CardTitle>
            <CardDescription>単品でも、本体+蓋などのセット（最大5品目の合算）でも計算できます</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>品目（セットの場合は複数行）</Label>
              {items.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={item} onChange={e => setItems(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                    placeholder={i === 0 ? '例: BF-362 ホワイト本体' : '例: BF-362 嵌合蓋'} />
                  {items.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => setItems(prev => prev.filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {items.length < 5 && (
                <Button variant="outline" size="sm" onClick={() => setItems(prev => [...prev, ''])}>
                  <Plus className="mr-1 h-3 w-3" />品目を追加（蓋など）
                </Button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>数量（ケース）</Label>
                <Input type="number" min={1} value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} />
              </div>
              <div className="space-y-1">
                <Label>販売形態</Label>
                <select value={mode} onChange={e => setMode(e.target.value as typeof mode)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                  <option value="own">自社配送（ケース）</option>
                  <option value="direct">メーカー直送</option>
                  <option value="bara">バラ売り</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>届け先（任意）</Label>
                <Input value={pref} onChange={e => setPref(e.target.value)} placeholder="例: 沖縄県" />
              </div>
            </div>

            <Button onClick={handleCalc} disabled={isCalculating}>
              {isCalculating ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />計算中...</> : <><Calculator className="mr-1 h-4 w-4" />計算する</>}
            </Button>

            {quote && (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">提示単価{quote.items.length > 1 ? '（セット）' : ''}</p>
                    <p className="text-xl font-bold">{quote.unit_price != null ? `${quote.unit_price}円` : '要個別確認'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ケース金額</p>
                    <p className="text-xl font-bold">{quote.case_price != null ? `${quote.case_price.toLocaleString()}円` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">合計（{quote.qty_cases}cs）</p>
                    <p className="text-xl font-bold">{quote.total != null ? `${quote.total.toLocaleString()}円` : '—'}</p>
                  </div>
                </div>

                {quote.warnings.length > 0 && (
                  <div className="rounded bg-yellow-50 dark:bg-yellow-900/20 p-2 space-y-1">
                    {quote.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-yellow-800 dark:text-yellow-200 flex gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{w}
                      </p>
                    ))}
                  </div>
                )}

                <div className="text-xs space-y-1">
                  <p className="font-medium text-muted-foreground">計算内訳</p>
                  {quote.calc_steps.map((s, i) => (
                    <p key={i} className="font-mono text-muted-foreground">{s}</p>
                  ))}
                </div>

                <div className="text-xs text-muted-foreground border-t pt-2">
                  <p>内訳（社外秘・顧客提示禁止）: セット原価 {quote.cost_price_set}円 / 下限売価 {quote.floor_price_set}円 / マージン {Math.round(quote.margin_rate * 100)}%</p>
                  {quote.items.map((it, i) => (
                    <p key={i} className="font-mono">{it.name}: 原価{it.cost_price}円（入数{it.nyusu ?? '-'}）</p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
