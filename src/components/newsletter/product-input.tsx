'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Trash2, GripVertical, Check, AlertCircle } from 'lucide-react'
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
  onRemove: (index: number) => void
  isRanking?: boolean
}

export function ProductInput({ product, index, onUpdate, onRemove, isRanking }: ProductInputProps) {
  const [scraping, setScraping] = useState(false)

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
            </div>
            {product.product_name && (
              <div className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-600" />
                <span>商品名: {product.product_name}</span>
                {product.s3_image_url && (
                  <span className="text-green-600">画像: S3アップ済</span>
                )}
              </div>
            )}
            {product.s3_image_url && (
              <img
                src={product.s3_image_url}
                alt={product.product_name || ''}
                className="h-20 w-20 object-cover rounded border"
              />
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemove(index)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
