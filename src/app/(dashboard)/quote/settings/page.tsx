'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Save, Settings } from 'lucide-react'
import { toast } from 'sonner'

interface SettingRow {
  key: string
  value: number
  description: string | null
  updated_at: string
}

const KEY_LABELS: Record<string, string> = {
  margin_rate: 'マージン率（自社配送・ケース）',
  margin_rate_direct: 'マージン率（直送）',
  margin_rate_bara: 'マージン率（バラ売り）',
  standard_shipping: '標準送料（円/口）',
  free_shipping_line: '送料無料ライン（円）',
}

export default function QuoteSettingsPage() {
  const [settings, setSettings] = useState<SettingRow[]>([])
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/quote/settings')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setSettings(data) })
      .catch(() => toast.error('設定の取得に失敗しました'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(key: string) {
    const raw = edited[key]
    if (raw === undefined) return
    const value = parseFloat(raw)
    if (isNaN(value) || value < 0) { toast.error('0以上の数値を入力してください'); return }
    setSavingKey(key)
    try {
      const res = await fetch('/api/quote/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      const data = await res.json()
      if (!res.ok || data.result !== 'updated') throw new Error(data.reason || data.error || '更新に失敗しました')
      setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s))
      setEdited(prev => { const next = { ...prev }; delete next[key]; return next })
      toast.success(`${KEY_LABELS[key] || key} を ${data.old_value} → ${value} に更新しました`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新に失敗しました')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="h-6 w-6" />見積り設定</h1>
        <p className="text-sm text-muted-foreground">
          マージン率・送料の設定。変更は即座に見積もり計算（管理画面・Claude・GPTs共通）へ反映され、変更履歴が記録されます。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>計算パラメータ</CardTitle>
          <CardDescription>率は小数で入力（例: 25% → 0.25）</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {settings.map(s => (
                <div key={s.key} className="flex items-end gap-3">
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">{KEY_LABELS[s.key] || s.key}</p>
                    {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                  </div>
                  <div className="w-32">
                    <Input
                      type="number"
                      step="0.01"
                      value={edited[s.key] ?? String(s.value)}
                      onChange={e => setEdited(prev => ({ ...prev, [s.key]: e.target.value }))}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSave(s.key)}
                    disabled={savingKey === s.key || edited[s.key] === undefined || edited[s.key] === String(s.value)}
                  >
                    {savingKey === s.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
