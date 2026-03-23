import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { FeaturePage, FeaturePageWithProducts, FeatureTemplateType } from '@/types'

export function useFeaturePages() {
  return useQuery<FeaturePage[]>({
    queryKey: ['feature-pages'],
    queryFn: async () => {
      const res = await fetch('/api/feature-page')
      if (!res.ok) throw new Error('特集ページの取得に失敗しました')
      return res.json()
    },
  })
}

export function useFeaturePage(id: string) {
  return useQuery<FeaturePageWithProducts>({
    queryKey: ['feature-page', id],
    queryFn: async () => {
      const res = await fetch(`/api/feature-page/${id}`)
      if (!res.ok) throw new Error('特集ページの取得に失敗しました')
      return res.json()
    },
    enabled: !!id,
  })
}

export function useCreateFeaturePage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { title: string; template_id?: string | null; template_type?: FeatureTemplateType; theme_color?: string }) => {
      const res = await fetch('/api/feature-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '作成に失敗しました')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-pages'] })
    },
  })
}

export function useUpdateFeaturePage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/feature-page/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '更新に失敗しました')
      }
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['feature-pages'] })
      queryClient.invalidateQueries({ queryKey: ['feature-page', variables.id] })
    },
  })
}

export function useDeleteFeaturePage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/feature-page/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '削除に失敗しました')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-pages'] })
    },
  })
}

export function useExportFeaturePage() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data?: Record<string, unknown> }) => {
      const res = await fetch(`/api/feature-page/${id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {}),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'エクスポートに失敗しました')
      }
      return res.json()
    },
  })
}

export function useGenerateFeatureContent() {
  return useMutation({
    mutationFn: async ({ id, templateType, directionMemo }: {
      id: string
      templateType: FeatureTemplateType
      directionMemo?: string
    }) => {
      const res = await fetch(`/api/feature-page/${id}/generate-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_type: templateType, direction_memo: directionMemo }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'コンテンツ生成に失敗しました')
      }
      return res.json()
    },
  })
}
