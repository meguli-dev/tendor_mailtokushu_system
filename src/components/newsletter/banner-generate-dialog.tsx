'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Download, ImageIcon, Check, PenLine, RotateCcw, FileCode, AlertTriangle } from 'lucide-react'
import { CopyButton } from '@/components/shared/copy-button'
import { toast } from 'sonner'

interface ProductData {
  product_url: string
  product_name?: string | null
  product_image_url?: string | null
  s3_image_url?: string | null
}

interface BannerGenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  newsletterId: string | null
  title: string
  products: ProductData[]
  subSectionProducts?: ProductData[]
  onApplyAsHeader: (bannerUrl: string) => void
}

interface SelectableProduct {
  id: string
  name: string
  imageUrl: string
  source: string
}

const MAX_EDITS = 3

export function BannerGenerateDialog({
  open,
  onOpenChange,
  newsletterId,
  title,
  products,
  subSectionProducts = [],
  onApplyAsHeader,
}: BannerGenerateDialogProps) {
  const [referenceImageUrl, setReferenceImageUrl] = useState('')
  const [width, setWidth] = useState(800)
  const [height, setHeight] = useState(800)
  const [mainText, setMainText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState('')
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())

  // Model selection
  const [imageModel, setImageModel] = useState<'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview'>('gemini-3.1-flash-image-preview')

  // Edit state
  const [editCount, setEditCount] = useState(0)
  const [editInstruction, setEditInstruction] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [appliedToHtml, setAppliedToHtml] = useState(false)

  // 月間使用量
  const [usage, setUsage] = useState<{ used: number; limit: number; remaining: number; isOverLimit: boolean } | null>(null)

  // Build selectable product list from both sources
  const allProducts: SelectableProduct[] = []
  products.forEach((p, i) => {
    const imageUrl = p.s3_image_url || p.product_image_url
    if (imageUrl) {
      allProducts.push({
        id: `main-${i}`,
        name: p.product_name || `おすすめ商品${i + 1}`,
        imageUrl,
        source: 'おすすめ',
      })
    }
  })
  subSectionProducts.forEach((p, i) => {
    const imageUrl = p.s3_image_url || p.product_image_url
    if (imageUrl) {
      allProducts.push({
        id: `sub-${i}`,
        name: p.product_name || `ランキング/紹介${i + 1}`,
        imageUrl,
        source: 'ランキング/紹介',
      })
    }
  })

  // Reset when dialog opens + fetch usage
  useEffect(() => {
    if (open) {
      setSelectedProductIds(new Set())
      setEditCount(0)
      setEditInstruction('')
      setGeneratedUrl('')
      setAppliedToHtml(false)
      // 使用量を取得
      fetch('/api/banner/usage')
        .then(res => res.json())
        .then(data => setUsage(data))
        .catch(() => {})
    }
  }, [open])

  function toggleProduct(id: string) {
    setSelectedProductIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < 4) {
        next.add(id)
      } else {
        toast.error('商品画像は最大4枚まで選択できます')
      }
      return next
    })
  }

  async function handleGenerate() {
    setIsGenerating(true)
    setGeneratedUrl('')
    setEditCount(0)
    setEditInstruction('')
    setAppliedToHtml(false)
    try {
      const selectedImages = allProducts
        .filter((p) => selectedProductIds.has(p.id))
        .map((p) => p.imageUrl)

      const selectedNames = allProducts
        .filter((p) => selectedProductIds.has(p.id))
        .map((p) => p.name)

      const res = await fetch('/api/banner/generate-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          main_text: mainText || undefined,
          newsletter_title: title,
          sub_text: selectedNames.length > 0 ? selectedNames.join('、') : undefined,
          width,
          height,
          product_images: selectedImages,
          reference_image_url: referenceImageUrl || undefined,
          page_context: `メルマガ特集: ${title}`,
          newsletter_id: newsletterId || undefined,
          image_model: imageModel,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error)
      }

      const data = await res.json()
      setGeneratedUrl(data.s3Url)
      if (data.usage) setUsage(data.usage)
      toast.success('バナー画像を生成しました')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'バナー生成に失敗しました')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleEdit() {
    if (!editInstruction.trim()) {
      toast.error('修正指示を入力してください')
      return
    }
    setIsEditing(true)
    try {
      const res = await fetch('/api/banner/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_image_url: generatedUrl,
          edit_instruction: editInstruction.trim(),
          image_model: imageModel,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error)
      }

      const data = await res.json()
      setGeneratedUrl(data.s3Url)
      setEditCount((prev) => prev + 1)
      setEditInstruction('')
      setAppliedToHtml(false)
      toast.success(`編集完了（${editCount + 1}/${MAX_EDITS}回）`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '画像編集に失敗しました')
    } finally {
      setIsEditing(false)
    }
  }

  function handleApplyAsHeader() {
    if (!generatedUrl) {
      toast.error('バナー画像がありません')
      return
    }
    onApplyAsHeader(generatedUrl)
    setAppliedToHtml(true)
    toast.success('バナーをヘッダー画像に設定しました。HTMLを再生成してください。')
  }

  function handleClose(value: boolean) {
    if (!isGenerating && !isEditing) {
      onOpenChange(value)
    }
  }

  const isProcessing = isGenerating || isEditing

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <ImageIcon className="inline mr-2 h-5 w-5" />
            バナー画像生成
          </DialogTitle>
          <DialogDescription>
            メルマガの内容をもとにAI（Gemini）でバナー画像を生成します。
          </DialogDescription>
        </DialogHeader>

        {/* 月間使用量 */}
        {usage && (
          <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
            usage.isOverLimit
              ? 'bg-destructive/10 text-destructive'
              : usage.remaining <= 5
                ? 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200'
                : 'bg-muted text-muted-foreground'
          }`}>
            <span>
              今月の生成: {usage.used}/{usage.limit}枚
              {usage.isOverLimit && (
                <span className="ml-1 font-medium">
                  <AlertTriangle className="inline h-3.5 w-3.5 mr-0.5" />
                  超過分は追加料金が発生します
                </span>
              )}
            </span>
            <span className="font-medium">残り {usage.remaining}枚</span>
          </div>
        )}

        <div className="space-y-4 py-2">
          {/* Generation settings - collapse after generation */}
          {!generatedUrl && (
            <>
              {/* モデル選択 */}
              <div className="space-y-2">
                <Label>AIモデル</Label>
                <select
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value as typeof imageModel)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash（通常）</option>
                  <option value="gemini-3-pro-image-preview">Gemini 3 Pro（高品質）</option>
                </select>
                {imageModel === 'gemini-3-pro-image-preview' && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    ※ 高品質モデルは1回の生成で2枚分を消費します
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>メインテキスト</Label>
                <Input
                  value={mainText}
                  onChange={(e) => setMainText(e.target.value)}
                  placeholder={title}
                />
                <p className="text-xs text-muted-foreground">
                  空欄の場合、特集テーマ「{title}」が使用されます
                </p>
              </div>

              <div className="space-y-2">
                <Label>参考画像URL（任意）</Label>
                <Input
                  value={referenceImageUrl}
                  onChange={(e) => setReferenceImageUrl(e.target.value)}
                  placeholder="https://... 過去のバナー画像など"
                />
                <p className="text-xs text-muted-foreground">
                  スタイルや雰囲気の参考にする画像のURLを指定できます
                </p>
              </div>

              <div className="space-y-2">
                <Label>サイズ</Label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: '正方形', w: 800, h: 800 },
                    { label: '横長バナー', w: 800, h: 400 },
                    { label: 'ワイド', w: 1200, h: 628 },
                    { label: '縦長', w: 600, h: 800 },
                  ].map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      variant={width === preset.w && height === preset.h ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => { setWidth(preset.w); setHeight(preset.h) }}
                    >
                      {preset.label} ({preset.w}x{preset.h})
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">幅 (px)</Label>
                    <Input
                      type="number"
                      value={width}
                      onChange={(e) => setWidth(parseInt(e.target.value) || 800)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">高さ (px)</Label>
                    <Input
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(parseInt(e.target.value) || 800)}
                    />
                  </div>
                </div>
              </div>

              {/* Product image selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>バナーに入れる商品画像（最大4枚）</Label>
                  <span className="text-xs text-muted-foreground">
                    {selectedProductIds.size}/4 選択中
                  </span>
                </div>

                {allProducts.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {allProducts.map((p) => {
                      const isSelected = selectedProductIds.has(p.id)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleProduct(p.id)}
                          className={`relative flex items-center gap-2 rounded-lg border p-2 text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'border-border hover:bg-muted/50'
                          }`}
                        >
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="h-12 w-12 rounded object-cover flex-shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground">{p.source}</p>
                          </div>
                          {isSelected && (
                            <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">商品画像がありません</p>
                )}

                <p className="text-xs text-muted-foreground">
                  選択しない場合、テキストのみのバナーが生成されます
                </p>
              </div>
            </>
          )}

          {/* Generated result + edit UI */}
          {generatedUrl && (
            <div className="space-y-4">
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <Label>生成結果</Label>
                  {editCount > 0 && (
                    <span className="text-xs text-muted-foreground">編集 {editCount}/{MAX_EDITS}回</span>
                  )}
                </div>
                <img
                  src={generatedUrl}
                  alt="生成されたバナー"
                  className="w-full rounded border"
                />
                <div className="flex gap-2 flex-wrap">
                  <CopyButton text={generatedUrl} label="URLをコピー" />
                  <Button variant="outline" size="sm" asChild>
                    <a href={generatedUrl} download="banner.png" target="_blank" rel="noopener noreferrer">
                      <Download className="mr-1 h-4 w-4" />
                      ダウンロード
                    </a>
                  </Button>
                  {!appliedToHtml ? (
                    <Button size="sm" onClick={handleApplyAsHeader}>
                      <FileCode className="mr-1 h-4 w-4" />
                      ヘッダー画像に設定
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      <Check className="mr-1 h-4 w-4" />
                      適用済み
                    </Button>
                  )}
                </div>
              </div>

              {/* Edit section */}
              {editCount < MAX_EDITS && (
                <div className="space-y-3 rounded-lg border border-dashed p-3">
                  <Label className="flex items-center gap-1">
                    <PenLine className="h-4 w-4" />
                    画像を編集（残り{MAX_EDITS - editCount}回）
                  </Label>
                  <Textarea
                    value={editInstruction}
                    onChange={(e) => setEditInstruction(e.target.value)}
                    placeholder="例: テキストをもっと大きくして、背景をもう少し明るくして"
                    rows={2}
                    disabled={isProcessing}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleEdit}
                      disabled={isProcessing || !editInstruction.trim()}
                    >
                      {isEditing ? (
                        <>
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          編集中...
                        </>
                      ) : (
                        <>
                          <PenLine className="mr-1 h-4 w-4" />
                          この指示で編集
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {editCount >= MAX_EDITS && (
                <p className="text-xs text-muted-foreground text-center">
                  編集回数の上限（{MAX_EDITS}回）に達しました
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {generatedUrl ? (
            <Button
              variant="outline"
              onClick={() => {
                setGeneratedUrl('')
                setEditCount(0)
                setEditInstruction('')
                setAppliedToHtml(false)
              }}
              disabled={isProcessing}
            >
              <RotateCcw className="mr-1 h-4 w-4" />
              設定を変更して再生成
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={isProcessing}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中...（30秒ほどかかります）
                </>
              ) : (
                'バナーを生成'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
