'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Trash2, GripVertical, Check, Pencil } from 'lucide-react'
import { toast } from 'sonner'

export interface ProductData {
  product_url: string
  product_name: string | null
  product_image_url: string | null
  s3_image_url: string | null
  sort_order: number
  is_ranking: boolean
  rank_position: number | null
}

interface ProductInputProps {
  product: ProductData
  index: number
  onUpdate: (index: number, data: Partial<ProductData>) => void
  onRemove?: (index: number) => void
  isRanking?: boolean
}

export function ProductInput({ product, index, onUpdate, onRemove, isRanking }: ProductInputProps) {
  const [scraping, setScraping] = useState(false)
  const [manualMode, setManualMode] = useState(false)

  async function handleScrape() {
    if (!product.product_url) {
      toast.error('URLを入力してください')
      return
    }

    setScraping(true)
    try {
      const res = await fetch('/api/product/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_url: product.product_url,
          auto_upload_s3: true,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '取得に失敗しました')
      }

      const data = await res.json()
      onUpdate(index, {
        product_name: data.product_name,
        product_image_url: data.original_image_url,
        s3_image_url: data.s3_image_url,
      })
      toast.success(`${data.product_name} を取得しました`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '取得に失敗しました')
    } finally {
      setScraping(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-2">
          <GripVertical className="h-5 w-5 text-muted-foreground mt-2 cursor-grab" />
          <div className="flex-1 space-y-2">
            <Label>{isRanking ? `ランキング ${product.rank_position || index + 1}位` : `商品 ${index + 1}`}</Label>
            {/* URL入力 + 取得ボタン + 手動設定ボタン */}
            <div className="flex gap-2">
              <Input
                value={product.product_url}
                onChange={(e) => onUpdate(index, { product_url: e.target.value })}
                placeholder="https://yo-ki-navi.com/product.php?id=..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleScrape}
                disabled={scraping}
              >
                {scraping ? <Loader2 className="h-4 w-4 animate-spin" /> : '取得'}
              </Button>
              <Button
                type="button"
                variant={manualMode ? 'default' : 'outline'}
                onClick={() => setManualMode(!manualMode)}
                title="手動で商品名・画像を設定"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>

            {/* 手動設定フォーム */}
            {manualMode && (
              <div className="space-y-2 rounded-lg border border-dashed p-3 bg-muted/20">
                <p className="text-xs text-muted-foreground font-medium">手動設定</p>
                <div className="space-y-1">
                  <Label className="text-xs">商品名</Label>
                  <Input
                    value={product.product_name || ''}
                    onChange={(e) => onUpdate(index, { product_name: e.target.value || null })}
                    placeholder="商品名を入力"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">画像URL</Label>
                  <Input
                    value={product.s3_image_url || product.product_image_url || ''}
                    onChange={(e) => onUpdate(index, {
                      product_image_url: e.target.value || null,
                      s3_image_url: e.target.value || null,
                    })}
                    placeholder="https://... （画像の直リンク）"
                  />
                  {product.s3_image_url && product.product_image_url && product.s3_image_url !== product.product_image_url && (
                    <p className="text-xs text-muted-foreground">元URL: {product.product_image_url}</p>
                  )}
                </div>
              </div>
            )}

            {/* 取得済み情報の表示 */}
            {product.product_name && !manualMode && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>商品名: {product.product_name}</span>
                </div>
                {product.s3_image_url ? (
                  <p className="text-xs text-green-600 break-all">画像: {product.s3_image_url}</p>
                ) : product.product_image_url ? (
                  <p className="text-xs text-orange-500 break-all">画像（元URL）: {product.product_image_url}</p>
                ) : null}
              </div>
            )}
            {(product.s3_image_url || product.product_image_url) && (
              <img
                src={product.s3_image_url || product.product_image_url || ''}
                alt={product.product_name || ''}
                className="h-20 w-20 object-cover rounded border"
              />
            )}
          </div>
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemove(index)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
