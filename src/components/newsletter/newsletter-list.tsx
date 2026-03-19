'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Trash2, Loader2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { NewsletterStatusBadge } from '@/components/shared/status-badge'
import { useDeleteNewsletter } from '@/hooks/use-newsletters'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { Newsletter } from '@/types'

interface NewsletterListProps {
  newsletters: Newsletter[]
}

export function NewsletterList({ newsletters }: NewsletterListProps) {
  const deleteMutation = useDeleteNewsletter()
  const router = useRouter()

  function handleDelete(id: string, title: string) {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success(`「${title}」を削除しました（S3画像も削除済み）`)
        router.refresh()
      },
      onError: (err) => {
        toast.error(err.message)
      },
    })
  }

  if (!newsletters.length) {
    return <p className="text-muted-foreground text-sm">メルマガがありません</p>
  }

  return (
    <div className="space-y-2">
      {newsletters.map((nl) => (
        <div key={nl.id} className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-3">
            <span className="font-medium">{nl.title}</span>
            <NewsletterStatusBadge status={nl.status} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {new Date(nl.created_at).toLocaleDateString('ja-JP')}
            </span>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/newsletter/${nl.id}`}>編集</Link>
            </Button>
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              }
              title="メルマガを削除"
              description={`「${nl.title}」を削除します。アップロード済みのS3画像も一緒に削除されます。この操作は取り消せません。`}
              onConfirm={() => handleDelete(nl.id, nl.title)}
              confirmLabel="削除する"
            />
          </div>
        </div>
      ))}
    </div>
  )
}
