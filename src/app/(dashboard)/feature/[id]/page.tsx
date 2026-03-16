'use client'

import { use, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Plus, Code, Loader2 } from 'lucide-react'
import { ProductInput, type ProductData } from '@/components/newsletter/product-input'
import { CopyButton } from '@/components/shared/copy-button'
import { useFeaturePage, useUpdateFeaturePage, useExportFeaturePage } from '@/hooks/use-feature-pages'
import { Skeleton } from '@/components/ui/skeleton'
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

export default function EditFeaturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: featurePage, isLoading } = useFeaturePage(id)
  const updateMutation = useUpdateFeaturePage()
  const exportMutation = useExportFeaturePage()

  const [title, setTitle] = useState('')
  const [headerImageUrl, setHeaderImageUrl] = useState('')
  const [products, setProducts] = useState<ProductData[]>([{ ...emptyProduct }])
  const [html, setHtml] = useState('')

  useEffect(() => {
    if (featurePage) {
      setTitle(featurePage.title)
      setHeaderImageUrl(featurePage.header_image_url || '')
      setHtml(featurePage.html_output || '')
      if (featurePage.products?.length) {
        setProducts(
          featurePage.products.map((p) => ({
            product_url: p.product_url,
            product_name: p.product_name,
            product_image_url: null,
            s3_image_url: p.s3_image_url,
            sort_order: p.sort_order,
            is_ranking: false,
            rank_position: null,
          }))
        )
      }
    }
  }, [featurePage])

  function updateProduct(index: number, data: Partial<ProductData>) {
    setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, ...data } : p)))
  }

  function removeProduct(index: number) {
    setProducts((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        id,
        data: {
          title,
          header_image_url: headerImageUrl || null,
          products: products.filter((p) => p.product_url).map((p) => ({
            product_url: p.product_url,
            product_name: p.product_name,
            s3_image_url: p.s3_image_url,
          })),
        },
      })
      toast.success('保存しました')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存に失敗しました')
    }
  }

  async function handleExport() {
    try {
      const result = await exportMutation.mutateAsync(id)
      setHtml(result.html)
      toast.success('HTMLを生成しました')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'エクスポートに失敗しました')
    }
  }

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          戻る
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? '保存中...' : '保存'}
          </Button>
          <Button onClick={handleExport} disabled={exportMutation.isPending}>
            {exportMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Code className="mr-1 h-4 w-4" />}
            HTML生成
          </Button>
        </div>
      </div>

      <h1 className="text-2xl font-bold">特集ページ編集</h1>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label>タイトル</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>ヘッダー画像URL</Label>
            <Input value={headerImageUrl} onChange={(e) => setHeaderImageUrl(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>商品</CardTitle>
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
            variant="outline"
            onClick={() => setProducts((prev) => [...prev, { ...emptyProduct, sort_order: prev.length }])}
            className="w-full"
          >
            <Plus className="mr-1 h-4 w-4" />
            商品を追加
          </Button>
        </CardContent>
      </Card>

      {html && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>HTMLソース</CardTitle>
                <CopyButton text={html} label="HTMLをコピー" />
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[400px] text-xs font-mono whitespace-pre-wrap">
                {html}
              </pre>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>プレビュー</CardTitle>
            </CardHeader>
            <CardContent>
              <iframe srcDoc={html} className="w-full min-h-[400px] border rounded" sandbox="allow-same-origin" title="プレビュー" />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
