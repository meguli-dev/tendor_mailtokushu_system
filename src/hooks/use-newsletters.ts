import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Newsletter, NewsletterWithProducts } from '@/types'

export function useNewsletters() {
  return useQuery<Newsletter[]>({
    queryKey: ['newsletters'],
    queryFn: async () => {
      const res = await fetch('/api/newsletter')
      if (!res.ok) throw new Error('メルマガの取得に失敗しました')
      return res.json()
    },
  })
}

export function useNewsletter(id: string) {
  return useQuery<NewsletterWithProducts>({
    queryKey: ['newsletter', id],
    queryFn: async () => {
      const res = await fetch(`/api/newsletter/${id}`)
      if (!res.ok) throw new Error('メルマガの取得に失敗しました')
      return res.json()
    },
    enabled: !!id,
  })
}

export function useCreateNewsletter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { title: string; template_id?: string | null }) => {
      const res = await fetch('/api/newsletter', {
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
      queryClient.invalidateQueries({ queryKey: ['newsletters'] })
    },
  })
}

export function useUpdateNewsletter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Newsletter> }) => {
      const res = await fetch(`/api/newsletter/${id}`, {
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
      queryClient.invalidateQueries({ queryKey: ['newsletters'] })
      queryClient.invalidateQueries({ queryKey: ['newsletter', variables.id] })
    },
  })
}

export function useDeleteNewsletter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/newsletter/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '削除に失敗しました')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletters'] })
    },
  })
}

export function useExportNewsletter() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/newsletter/${id}/export`, { method: 'POST' })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'エクスポートに失敗しました')
      }
      return res.json()
    },
  })
}

export function useDuplicateNewsletter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/newsletter/${id}/duplicate`, { method: 'POST' })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '複製に失敗しました')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletters'] })
    },
  })
}
