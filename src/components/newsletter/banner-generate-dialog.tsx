'use client'

import { useState } from 'react'
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
import { Loader2, Download, ImageIcon } from 'lucide-react'
import { CopyButton } from '@/components/shared/copy-button'
import { toast } from 'sonner'

interface ProductData {
  product_url: string
  product_name?: string | null
  s3_image_url?: string | null
}

interface BannerGenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  newsletterId: string | null
  title: string
  products: ProductData[]
}

export function BannerGenerateDialog({
  open,
  onOpenChange,
  newsletterId,
  title,
  products,
}: BannerGenerateDialogProps) {
  const [referenceImageUrl, setReferenceImageUrl] = useState('')
  const [width, setWidth] = useState(800)
  const [height, setHeight] = useState(400)
  const [mainText, setMainText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState('')

  async function handleGenerate() {
    setIsGenerating(true)
    setGeneratedUrl('')
    try {
      const productImages = products
        .map((p) => p.s3_image_url)
        .filter((url): url is string => !!url)

      const productNames = products
        .map((p) => p.product_name)
        .filter((name): name is string => !!name)

      const res = await fetch('/api/banner/generate-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          main_text: mainText || title,
          sub_text: productNames.length > 0 ? productNames.join('、') : undefined,
          width,
          height,
          product_images: productImages,
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
      <DialogContent className="sm:max-w-lg">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>幅 (px)</Label>
              <Input
                type="number"
                value={width}
                onChange={(e) => setWidth(parseInt(e.target.value) || 800)}
              />
            </div>
            <div className="space-y-2">
              <Label>高さ (px)</Label>
              <Input
                type="number"
                value={height}
                onChange={(e) => setHeight(parseInt(e.target.value) || 400)}
              />
            </div>
          </div>

          {products.filter((p) => p.s3_image_url).length > 0 && (
            <div className="space-y-2">
              <Label>使用する商品画像</Label>
              <div className="flex gap-2 flex-wrap">
                {products
                  .filter((p) => p.s3_image_url)
                  .map((p, i) => (
                    <div key={i} className="flex items-center gap-1 text-xs bg-muted rounded px-2 py-1">
                      <img
                        src={p.s3_image_url!}
                        alt={p.product_name || '商品'}
                        className="h-6 w-6 object-cover rounded"
                      />
                      <span className="max-w-[100px] truncate">{p.product_name || `商品${i + 1}`}</span>
                    </div>
                  ))}
              </div>
              <p className="text-xs text-muted-foreground">
                登録済みの商品画像がバナーに使用されます（最大4枚）
              </p>
            </div>
          )}

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
