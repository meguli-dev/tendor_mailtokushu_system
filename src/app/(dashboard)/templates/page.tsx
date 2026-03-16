'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useNewsletterTemplates, useDeleteTemplate } from '@/hooks/use-templates'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'

export default function TemplatesPage() {
  const { data: templates, isLoading } = useNewsletterTemplates()
  const deleteMutation = useDeleteTemplate()

  function handleDelete(id: string) {
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success('テンプレートを削除しました'),
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">テンプレート管理</h1>
        <Button asChild>
          <Link href="/templates/new">
            <Plus className="mr-1 h-4 w-4" />
            新規テンプレート
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-40 w-full mb-3" />
                <Skeleton className="h-5 w-1/2 mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !templates?.length ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            テンプレートがありません。新規テンプレートを作成してください。
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tmpl) => (
            <Card key={tmpl.id}>
              <CardContent className="p-4">
                {tmpl.thumbnail_url ? (
                  <img
                    src={tmpl.thumbnail_url}
                    alt={tmpl.name}
                    className="w-full h-40 object-cover rounded-md mb-3"
                  />
                ) : (
                  <div className="w-full h-40 bg-muted rounded-md mb-3 flex items-center justify-center text-muted-foreground text-sm">
                    プレビューなし
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{tmpl.name}</h3>
                    <Badge variant={tmpl.is_active ? 'default' : 'secondary'}>
                      {tmpl.is_active ? '有効' : '無効'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{tmpl.description}</p>
                  <div className="flex gap-1 text-xs text-muted-foreground">
                    <Badge variant="outline">商品数: {tmpl.product_count}</Badge>
                    {tmpl.has_ranking && <Badge variant="outline">ランキング</Badge>}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/templates/${tmpl.id}`}>
                        <Pencil className="mr-1 h-3 w-3" />
                        編集
                      </Link>
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="outline" size="sm" className="text-destructive">
                          <Trash2 className="mr-1 h-3 w-3" />
                          削除
                        </Button>
                      }
                      title="テンプレートの削除"
                      description="このテンプレートを削除しますか？この操作は取り消せません。"
                      onConfirm={() => handleDelete(tmpl.id)}
                      confirmLabel="削除"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
