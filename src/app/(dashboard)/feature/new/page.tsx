'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { ProductInput, type ProductData } from '@/components/newsletter/product-input'
import { useCreateFeaturePage, useUpdateFeaturePage } from '@/hooks/use-feature-pages'
import { toast } from 'sonner'

const emptyProduct: ProductData = {
  product_url: '',
  product_name: null,
  product_image_url: null,
  s3_image_url: null,
  sort_order: 0,
  is_ranking: false,
  rank_position: null,
}

export default function NewFeaturePage() {
  const router = useRouter()
  const createMutation = useCreateFeaturePage()
  const updateMutation = useUpdateFeaturePage()

  const [title, setTitle] = useState('')
  const [headerImageUrl, setHeaderImageUrl] = useState('')
  const [products, setProducts] = useState<ProductData[]>([{ ...emptyProduct }])

  function updateProduct(index: number, data: Partial<ProductData>) {
    setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, ...data } : p)))
  }

  function removeProduct(index: number) {
    setProducts((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (!title) {
      toast.error('タイトルを入力してください')
      return
    }

    try {
      const created = await createMutation.mutateAsync({ title })

      if (products.some((p) => p.product_url) || headerImageUrl) {
        await updateMutation.mutateAsync({
          id: created.id,
          data: {
            header_image_url: headerImageUrl || null,
            products: products.filter((p) => p.product_url).map((p) => ({
              product_url: p.product_url,
              product_name: p.product_name,
              s3_image_url: p.s3_image_url,
            })),
          },
        })
      }

      toast.success('特集ページを作成しました')
      router.push(`/feature/${created.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存に失敗しました')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          戻る
        </Button>
        <Button onClick={handleSave} disabled={createMutation.isPending}>
          {createMutation.isPending ? '保存中...' : '下書き保存'}
        </Button>
      </div>

      <h1 className="text-2xl font-bold">特集ページ作成</h1>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label>タイトル</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="春のテイクアウト容器特集" />
          </div>
          <div className="space-y-2">
            <Label>ヘッダー画像URL</Label>
            <Input value={headerImageUrl} onChange={(e) => setHeaderImageUrl(e.target.value)} placeholder="https://..." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>商品登録</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {products.map((product, index) => (
            <ProductInput
              key={index}
              product={product}
              index={index}
              onUpdate={updateProduct}
              onRemove={removeProduct}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setProducts((prev) => [...prev, { ...emptyProduct, sort_order: prev.length }])}
            className="w-full"
          >
            <Plus className="mr-1 h-4 w-4" />
            商品を追加
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
