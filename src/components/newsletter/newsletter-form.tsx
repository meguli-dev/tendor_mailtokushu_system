'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, ArrowLeft, Eye, Code, Copy } from 'lucide-react'
import { ProductInput, type ProductData } from './product-input'
import { useNewsletterTemplates } from '@/hooks/use-templates'
import { useCreateNewsletter, useUpdateNewsletter } from '@/hooks/use-newsletters'
import { toast } from 'sonner'
import type { NewsletterWithProducts } from '@/types'

interface NewsletterFormProps {
  newsletter?: NewsletterWithProducts
}

const emptyProduct: ProductData = {
  product_url: '',
  product_name: null,
  product_image_url: null,
  s3_image_url: null,
  sort_order: 0,
  is_ranking: false,
  rank_position: null,
}

export function NewsletterForm({ newsletter }: NewsletterFormProps) {
  const router = useRouter()
  const { data: templates, isLoading: templatesLoading } = useNewsletterTemplates()
  const createMutation = useCreateNewsletter()
  const updateMutation = useUpdateNewsletter()

  const [title, setTitle] = useState(newsletter?.title || '')
  const [templateId, setTemplateId] = useState(newsletter?.template_id || '')
  const [hasHeaderImage, setHasHeaderImage] = useState(newsletter?.has_header_image || false)
  const [headerImageUrl, setHeaderImageUrl] = useState(newsletter?.header_image_url || '')
  const [featureTitle, setFeatureTitle] = useState(newsletter?.feature_title || '')
  const [featureDescription, setFeatureDescription] = useState(newsletter?.feature_description || '')
  const [products, setProducts] = useState<ProductData[]>(
    newsletter?.products?.length
      ? newsletter.products.map((p) => ({
          product_url: p.product_url,
          product_name: p.product_name,
          product_image_url: p.product_image_url,
          s3_image_url: p.s3_image_url,
          sort_order: p.sort_order,
          is_ranking: p.is_ranking,
          rank_position: p.rank_position,
        }))
      : [{ ...emptyProduct }]
  )

  const isEditing = !!newsletter
  const selectedTemplate = templates?.find((t) => t.id === templateId)

  function updateProduct(index: number, data: Partial<ProductData>) {
    setProducts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...data } : p))
    )
  }

  function removeProduct(index: number) {
    setProducts((prev) => prev.filter((_, i) => i !== index))
  }

  function addProduct() {
    setProducts((prev) => [...prev, { ...emptyProduct, sort_order: prev.length }])
  }

  async function handleSave() {
    if (!title) {
      toast.error('タイトルを入力してください')
      return
    }

    const data = {
      title,
      template_id: templateId || null,
      has_header_image: hasHeaderImage,
      header_image_url: hasHeaderImage ? headerImageUrl || null : null,
      feature_title: featureTitle || null,
      feature_description: featureDescription || null,
      status: 'draft' as const,
    }

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: newsletter.id,
          data: {
            ...data,
            products: products.filter((p) => p.product_url),
          } as any,
        })
        toast.success('メルマガを更新しました')
      } else {
        const created = await createMutation.mutateAsync(data)
        // Save products separately after creation
        if (products.some((p) => p.product_url)) {
          await fetch(`/api/newsletter/${created.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              products: products.filter((p) => p.product_url),
            }),
          })
        }
        toast.success('メルマガを作成しました')
        router.push(`/newsletter/${created.id}`)
      }
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
            {createMutation.isPending || updateMutation.isPending ? '保存中...' : '下書き保存'}
          </Button>
          {isEditing && (
            <Button asChild>
              <a href={`/newsletter/${newsletter.id}/export`}>
                <Code className="mr-1 h-4 w-4" />
                HTML生成
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Title */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <Label htmlFor="title">メルマガタイトル</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="春の容器特集 〜テイクアウトを華やかに〜"
            />
          </div>
        </CardContent>
      </Card>

      {/* Header Image */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            ヘッダー画像設定
            <Switch
              checked={hasHeaderImage}
              onCheckedChange={setHasHeaderImage}
            />
          </CardTitle>
        </CardHeader>
        {hasHeaderImage && (
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={headerImageUrl}
                onChange={(e) => setHeaderImageUrl(e.target.value)}
                placeholder="ヘッダー画像URL"
                className="flex-1"
              />
              <Button variant="outline" asChild>
                <a href="/banner/create">バナー生成へ</a>
              </Button>
            </div>
            {headerImageUrl && (
              <img
                src={headerImageUrl}
                alt="ヘッダー"
                className="mt-2 max-h-40 rounded border"
              />
            )}
          </CardContent>
        )}
      </Card>

      {/* Template Selection */}
      <Card>
        <CardHeader>
          <CardTitle>テンプレート選択</CardTitle>
        </CardHeader>
        <CardContent>
          {templatesLoading ? (
            <div className="flex gap-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-32" />)}
            </div>
          ) : (
            <div className="flex gap-4 flex-wrap">
              {templates?.filter((t) => t.is_active).map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => setTemplateId(tmpl.id)}
                  className={`rounded-lg border-2 p-3 text-left transition-colors ${
                    templateId === tmpl.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  style={{ width: 160 }}
                >
                  {tmpl.thumbnail_url ? (
                    <img src={tmpl.thumbnail_url} alt={tmpl.name} className="h-20 w-full object-cover rounded mb-2" />
                  ) : (
                    <div className="h-20 bg-muted rounded mb-2 flex items-center justify-center text-xs text-muted-foreground">
                      {tmpl.name}
                    </div>
                  )}
                  <p className="text-sm font-medium">{tmpl.name}</p>
                  <p className="text-xs text-muted-foreground">商品数: {tmpl.product_count}</p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Products */}
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
          <Button type="button" variant="outline" onClick={addProduct} className="w-full">
            <Plus className="mr-1 h-4 w-4" />
            商品を追加
          </Button>
        </CardContent>
      </Card>

      {/* Feature Info */}
      <Card>
        <CardHeader>
          <CardTitle>特集情報（任意）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="featureTitle">特集タイトル</Label>
            <Input
              id="featureTitle"
              value={featureTitle}
              onChange={(e) => setFeatureTitle(e.target.value)}
              placeholder="春のテイクアウト特集"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="featureDescription">説明文</Label>
            <Textarea
              id="featureDescription"
              value={featureDescription}
              onChange={(e) => setFeatureDescription(e.target.value)}
              placeholder="春のテイクアウト需要に応える容器を厳選しました..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
