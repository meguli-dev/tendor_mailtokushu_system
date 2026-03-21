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
import { Loader2, Download, ImageIcon, Check } from 'lucide-react'
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
}

interface SelectableProduct {
  id: string
  name: string
  imageUrl: string
  source: string
}

export function BannerGenerateDialog({
  open,
  onOpenChange,
  newsletterId,
  title,
  products,
  subSectionProducts = [],
}: BannerGenerateDialogProps) {
  const [referenceImageUrl, setReferenceImageUrl] = useState('')
  const [width, setWidth] = useState(800)
  const [height, setHeight] = useState(800)
  const [mainText, setMainText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState('')
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())

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

  // Initialize selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedProductIds(new Set())
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
          main_text: mainText || title,
          sub_text: selectedNames.length > 0 ? selectedNames.join('、') : undefined,
          width,
          height,
          product_images: selectedImages,
          reference_image_url: referenceImageUrl || undefined,
          page_context: `メルマガ特集: ${title}`,
          newsletter_id: newsletterId || undefined,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error)
      }

      const data = await res.json()
      setGeneratedUrl(data.s3Url)
      toast.success('バナー画像を生成しました')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'バナー生成に失敗しました')
    } finally {
      setIsGenerating(false)
    }
  }

  function handleClose(value: boolean) {
    if (!isGenerating) {
      onOpenChange(value)
    }
  }

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

        <div className="space-y-4 py-2">
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

          {generatedUrl && (
            <div className="space-y-3 rounded-lg border p-3">
              <Label>生成結果</Label>
              <img
                src={generatedUrl}
                alt="生成されたバナー"
                className="w-full rounded border"
              />
              <div className="flex gap-2">
                <CopyButton text={generatedUrl} label="URLをコピー" />
                <Button variant="outline" size="sm" asChild>
                  <a href={generatedUrl} download="banner.png" target="_blank" rel="noopener noreferrer">
                    <Download className="mr-1 h-4 w-4" />
                    ダウンロード
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...（30秒ほどかかります）
              </>
            ) : generatedUrl ? (
              '再生成'
            ) : (
              'バナーを生成'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
