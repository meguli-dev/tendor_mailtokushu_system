'use client'

import { use } from 'react'
import { TemplateEditor } from '@/components/templates/template-editor'
import { useNewsletterTemplate } from '@/hooks/use-templates'
import { Skeleton } from '@/components/ui/skeleton'

export default function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: template, isLoading } = useNewsletterTemplate(id)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!template) {
    return <p className="text-muted-foreground">テンプレートが見つかりません</p>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">テンプレート編集: {template.name}</h1>
      <TemplateEditor template={template} />
    </div>
  )
}
