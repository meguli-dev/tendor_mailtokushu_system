'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Save, Palette, Type, ImageIcon, Check } from 'lucide-react'
import { toast } from 'sonner'
import type { BannerDesignStyle, BannerFontStyle, BannerColorBackground } from '@/types'

const DESIGN_STYLES: Array<{ value: BannerDesignStyle; label: string; description: string }> = [
  { value: 'clean', label: 'クリーン', description: '清潔感・信頼感のあるデザイン' },
  { value: 'warm', label: 'ウォーム', description: '温かみのある親しみやすいデザイン' },
  { value: 'natural', label: 'ナチュラル', description: '自然素材感・オーガニックな印象' },
  { value: 'pop', label: 'ポップ', description: '明るく楽しい、目を引くデザイン' },
  { value: 'elegant', label: 'エレガント', description: '高級感・上品な印象' },
  { value: 'minimal', label: 'ミニマル', description: 'シンプルで洗練されたデザイン' },
  { value: 'cool', label: 'クール', description: 'モダンでスタイリッシュな印象' },
]

const FONT_STYLES: Array<{ value: BannerFontStyle; label: string; description: string }> = [
  { value: 'bold_readable', label: '太字・読みやすい', description: 'ゴシック系の太い文字で視認性重視' },
  { value: 'elegant_serif', label: '上品・明朝体', description: '品格のある明朝体ベース' },
  { value: 'casual_round', label: 'カジュアル・丸文字', description: '柔らかく親しみやすい丸ゴシック' },
  { value: 'modern_sans', label: 'モダン・サンセリフ', description: 'すっきりとした現代的なフォント' },
  { value: 'handwritten', label: '手書き風', description: '温かみのある手書きテイスト' },
]

const BG_STYLES: Array<{ value: BannerColorBackground; label: string }> = [
  { value: 'warm', label: '暖色系' },
  { value: 'cool', label: '寒色系' },
  { value: 'neutral', label: 'ニュートラル' },
  { value: 'pastel', label: 'パステル' },
  { value: 'vivid', label: 'ビビッド' },
]

interface TonmanaForm {
  design_style: BannerDesignStyle
  color_primary: string
  color_accent: string
  color_background: BannerColorBackground
  font_style: BannerFontStyle
  atmosphere: string
  ng_elements: string
  reference_image_url: string
  additional_instructions: string
}

const DEFAULT_FORM: TonmanaForm = {
  design_style: 'clean',
  color_primary: '#e8690a',
  color_accent: '#2563eb',
  color_background: 'warm',
  font_style: 'bold_readable',
  atmosphere: '',
  ng_elements: '',
  reference_image_url: '',
  additional_instructions: '',
}

export default function BannerTonmanaPage() {
  const [form, setForm] = useState<TonmanaForm>(DEFAULT_FORM)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasExisting, setHasExisting] = useState(false)

  useEffect(() => {
    fetch('/api/banner/tonmana')
      .then(res => res.json())
      .then(data => {
        if (data && data.id) {
          setForm({
            design_style: data.design_style || DEFAULT_FORM.design_style,
            color_primary: data.color_primary || DEFAULT_FORM.color_primary,
            color_accent: data.color_accent || DEFAULT_FORM.color_accent,
            color_background: data.color_background || DEFAULT_FORM.color_background,
            font_style: data.font_style || DEFAULT_FORM.font_style,
            atmosphere: data.atmosphere || '',
            ng_elements: data.ng_elements || '',
            reference_image_url: data.reference_image_url || '',
            additional_instructions: data.additional_instructions || '',
          })
          setHasExisting(true)
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  async function handleSave() {
    setIsSaving(true)
    try {
      const res = await fetch('/api/banner/tonmana', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      setHasExisting(true)
      toast.success('トンマナ設定を保存しました')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setIsSaving(false)
    }
  }

  function updateForm<K extends keyof TonmanaForm>(key: K, value: TonmanaForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">バナー トンマナ設定</h1>
        <p className="text-muted-foreground mt-1">
          バナー画像生成時のデザインルールを設定します。ここで設定した内容がAI生成時に自動的に適用されます。
        </p>
      </div>

      {/* デザインスタイル */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            デザインスタイル
          </CardTitle>
          <CardDescription>バナー全体の雰囲気を選択してください</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {DESIGN_STYLES.map(style => (
              <button
                key={style.value}
                type="button"
                onClick={() => updateForm('design_style', style.value)}
                className={`rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                  form.design_style === style.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <div className="font-medium text-sm">{style.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{style.description}</div>
                {form.design_style === style.value && (
                  <Check className="h-4 w-4 text-primary mt-1" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* カラー設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            カラー設定
          </CardTitle>
          <CardDescription>ブランドカラーと背景の色味を指定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>メインカラー</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color_primary}
                  onChange={e => updateForm('color_primary', e.target.value)}
                  className="h-9 w-12 rounded border cursor-pointer"
                />
                <Input
                  value={form.color_primary}
                  onChange={e => updateForm('color_primary', e.target.value)}
                  placeholder="#e8690a"
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">タイトルや強調部分に使用</p>
            </div>
            <div className="space-y-2">
              <Label>アクセントカラー</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color_accent}
                  onChange={e => updateForm('color_accent', e.target.value)}
                  className="h-9 w-12 rounded border cursor-pointer"
                />
                <Input
                  value={form.color_accent}
                  onChange={e => updateForm('color_accent', e.target.value)}
                  placeholder="#2563eb"
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">ボタンやアクセント要素に使用</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>背景の色味</Label>
            <div className="flex gap-2 flex-wrap">
              {BG_STYLES.map(bg => (
                <Button
                  key={bg.value}
                  type="button"
                  variant={form.color_background === bg.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateForm('color_background', bg.value)}
                >
                  {bg.label}
                </Button>
              ))}
            </div>
          </div>

          {/* カラープレビュー */}
          <div className="rounded-lg border p-4">
            <Label className="text-xs text-muted-foreground mb-2 block">カラープレビュー</Label>
            <div className="flex gap-3 items-center">
              <div
                className="h-12 w-12 rounded-lg border"
                style={{ backgroundColor: form.color_primary }}
                title="メインカラー"
              />
              <div
                className="h-12 w-12 rounded-lg border"
                style={{ backgroundColor: form.color_accent }}
                title="アクセントカラー"
              />
              <div className="text-sm text-muted-foreground">
                メイン: {form.color_primary} / アクセント: {form.color_accent}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* フォントスタイル */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5" />
            フォントスタイル
          </CardTitle>
          <CardDescription>バナー内テキストの印象を選択してください</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FONT_STYLES.map(fs => (
              <button
                key={fs.value}
                type="button"
                onClick={() => updateForm('font_style', fs.value)}
                className={`rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                  form.font_style === fs.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <div className="font-medium text-sm">{fs.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{fs.description}</div>
                {form.font_style === fs.value && (
                  <Check className="h-4 w-4 text-primary mt-1" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 雰囲気・詳細設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            雰囲気・詳細設定
          </CardTitle>
          <CardDescription>自由記述でデザインの方向性を細かく指定できます</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>雰囲気・キーワード</Label>
            <Textarea
              value={form.atmosphere}
              onChange={e => updateForm('atmosphere', e.target.value)}
              placeholder="例: エコ・環境に優しい・SDGs感、季節感（春らしい桜のイメージ）、高級感と清潔感の両立"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              バナーに持たせたい雰囲気やイメージキーワードを自由に記述
            </p>
          </div>

          <div className="space-y-2">
            <Label>NG要素（避けたいもの）</Label>
            <Textarea
              value={form.ng_elements}
              onChange={e => updateForm('ng_elements', e.target.value)}
              placeholder="例: 派手すぎる色使い、子供向けのイメージ、英語のみのテキスト"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              生成時に避けてほしいデザイン要素や表現
            </p>
          </div>

          <div className="space-y-2">
            <Label>参考画像URL（固定）</Label>
            <Input
              value={form.reference_image_url}
              onChange={e => updateForm('reference_image_url', e.target.value)}
              placeholder="https://... 毎回参考にする画像のURL"
            />
            <p className="text-xs text-muted-foreground">
              毎回のバナー生成時にスタイル参考として使用する画像（個別に指定する参考画像とは別）
            </p>
          </div>

          <div className="space-y-2">
            <Label>追加指示</Label>
            <Textarea
              value={form.additional_instructions}
              onChange={e => updateForm('additional_instructions', e.target.value)}
              placeholder="例: ロゴは必ず右下に配置、余白を広めに取る、テキストは2行以内"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              AIに毎回伝えたいデザインルールや制約
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 保存ボタン */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving} size="lg">
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {hasExisting ? 'トンマナ設定を更新' : 'トンマナ設定を保存'}
            </>
          )}
        </Button>
        <p className="text-sm text-muted-foreground">
          保存すると、次回以降のバナー生成時に自動的に適用されます
        </p>
      </div>
    </div>
  )
}
