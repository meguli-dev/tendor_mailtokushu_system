'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { TEMPLATE_VARIABLES } from '@/lib/constants'
import { toast } from 'sonner'
import type { NewsletterTemplate } from '@/types'
import { useCreateTemplate, useUpdateTemplate } from '@/hooks/use-templates'

interface TemplateEditorProps {
  template?: NewsletterTemplate
}

export function TemplateEditor({ template }: TemplateEditorProps) {
  const router = useRouter()
  const createMutation = useCreateTemplate()
  const updateMutation = useUpdateTemplate()

  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [productCount, setProductCount] = useState(template?.product_count || 2)
  const [hasRanking, setHasRanking] = useState(template?.has_ranking || false)
  const [htmlTemplate, setHtmlTemplate] = useState(template?.html_template || '')
  const [thumbnailUrl, setThumbnailUrl] = useState(template?.thumbnail_url || '')
  const [isActive, setIsActive] = useState(template?.is_active ?? true)

  const isEditing = !!template

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const data = {
      name,
      description,
      product_count: productCount,
      has_ranking: hasRanking,
      html_template: htmlTemplate,
      thumbnail_url: thumbnailUrl || null,
      is_active: isActive,
    }

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: template.id, data })
        toast.success('テンプレートを更新しました')
      } else {
        await createMutation.mutateAsync(data)
        toast.success('テンプレートを作成しました')
        router.push('/templates')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存に失敗しました')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Form */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>基本情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">テンプレート名</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="パターンA - 2商品"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">説明</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="2商品を横並びで表示するレイアウト"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="productCount">商品数</Label>
                  <Input
                    id="productCount"
                    type="number"
                    min={1}
                    max={10}
                    value={productCount}
                    onChange={(e) => setProductCount(parseInt(e.target.value))}
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    id="hasRanking"
                    checked={hasRanking}
                    onCheckedChange={setHasRanking}
                  />
                  <Label htmlFor="hasRanking">ランキングあり</Label>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="isActive"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
                <Label htmlFor="isActive">有効</Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="thumbnailUrl">サムネイルURL</Label>
                <Input
                  id="thumbnailUrl"
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>利用可能な変数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="rounded bg-muted px-2 py-1 text-xs font-mono hover:bg-muted/80 cursor-pointer"
                    onClick={() => {
                      navigator.clipboard.writeText(v)
                      toast.info(`${v} をコピーしました`)
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                クリックでクリップボードにコピーされます。
                条件ブロック: {'<!--IF:VARIABLE-->...<!--ENDIF:VARIABLE-->'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right: HTML Editor + Preview */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>HTMLテンプレート</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={htmlTemplate}
                onChange={(e) => setHtmlTemplate(e.target.value)}
                placeholder="<!DOCTYPE html>..."
                className="font-mono text-sm min-h-[400px]"
                required
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>プレビュー</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden bg-white">
                <iframe
                  srcDoc={htmlTemplate}
                  className="w-full min-h-[400px]"
                  sandbox="allow-same-origin"
                  title="テンプレートプレビュー"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          キャンセル
        </Button>
        <Button
          type="submit"
          disabled={createMutation.isPending || updateMutation.isPending}
        >
          {createMutation.isPending || updateMutation.isPending
            ? '保存中...'
            : isEditing
              ? '更新'
              : '作成'}
        </Button>
      </div>
    </form>
  )
}
