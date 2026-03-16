'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Upload, Trash2, Copy, Check } from 'lucide-react'
import { useImages, useUploadImage, useDeleteImage } from '@/hooks/use-images'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

export default function ImagesPage() {
  const { data: images, isLoading } = useImages()
  const uploadMutation = useUploadImage()
  const deleteMutation = useDeleteImage()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return

    Array.from(files).forEach((file) => {
      uploadMutation.mutate(
        { file },
        {
          onSuccess: () => toast.success(`${file.name} をアップロードしました`),
          onError: (err) => toast.error(err.message),
        }
      )
    })

    e.target.value = ''
  }

  function handleCopyUrl(id: string, url: string) {
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    toast.info('URLをコピーしました')
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success('画像を削除しました'),
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">画像管理</h1>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
            <Upload className="mr-1 h-4 w-4" />
            {uploadMutation.isPending ? 'アップロード中...' : '画像をアップロード'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : !images?.length ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            画像がありません。アップロードしてください。
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {images.map((img) => (
            <Card key={img.id} className="overflow-hidden">
              <div className="aspect-square relative group">
                <img
                  src={img.s3_url}
                  alt={img.file_name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => handleCopyUrl(img.id, img.s3_url)}
                  >
                    {copiedId === img.id ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="destructive" size="icon">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    }
                    title="画像の削除"
                    description="この画像を削除しますか？S3からも削除されます。"
                    onConfirm={() => handleDelete(img.id)}
                    confirmLabel="削除"
                  />
                </div>
              </div>
              <CardContent className="p-2">
                <p className="text-xs truncate">{img.file_name}</p>
                <Badge variant="outline" className="text-xs mt-1">
                  {img.image_type}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
