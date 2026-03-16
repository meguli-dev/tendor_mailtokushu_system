import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { NewsletterTemplate } from '@/types'
import type { NewsletterTemplateInput } from '@/lib/validators'

export function useNewsletterTemplates() {
  return useQuery<NewsletterTemplate[]>({
    queryKey: ['newsletter-templates'],
    queryFn: async () => {
      const res = await fetch('/api/template/newsletter')
      if (!res.ok) throw new Error('テンプレートの取得に失敗しました')
      return res.json()
    },
  })
}

export function useNewsletterTemplate(id: string) {
  return useQuery<NewsletterTemplate>({
    queryKey: ['newsletter-template', id],
    queryFn: async () => {
      const res = await fetch(`/api/template/newsletter/${id}`)
      if (!res.ok) throw new Error('テンプレートの取得に失敗しました')
      return res.json()
    },
    enabled: !!id,
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: NewsletterTemplateInput) => {
      const res = await fetch('/api/template/newsletter', {
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
      queryClient.invalidateQueries({ queryKey: ['newsletter-templates'] })
    },
  })
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<NewsletterTemplateInput> }) => {
      const res = await fetch(`/api/template/newsletter/${id}`, {
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
      queryClient.invalidateQueries({ queryKey: ['newsletter-templates'] })
      queryClient.invalidateQueries({ queryKey: ['newsletter-template', variables.id] })
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/template/newsletter/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '削除に失敗しました')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletter-templates'] })
    },
  })
}
