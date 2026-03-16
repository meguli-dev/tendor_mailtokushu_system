import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AppImage } from '@/types'

export function useImages() {
  return useQuery<AppImage[]>({
    queryKey: ['images'],
    queryFn: async () => {
      const res = await fetch('/api/image')
      if (!res.ok) throw new Error('画像の取得に失敗しました')
      return res.json()
    },
  })
}

export function useUploadImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, imageType }: { file: File; imageType?: string }) => {
      const formData = new FormData()
      formData.append('file', file)
      if (imageType) formData.append('image_type', imageType)

      const res = await fetch('/api/image/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'アップロードに失敗しました')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] })
    },
  })
}

export function useDeleteImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/image/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '削除に失敗しました')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] })
    },
  })
}
