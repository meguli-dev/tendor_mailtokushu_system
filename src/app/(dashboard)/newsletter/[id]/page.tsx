'use client'

import { use } from 'react'
import { NewsletterForm } from '@/components/newsletter/newsletter-form'
import { useNewsletter } from '@/hooks/use-newsletters'
import { Skeleton } from '@/components/ui/skeleton'

export default function EditNewsletterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: newsletter, isLoading } = useNewsletter(id)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!newsletter) {
    return <p className="text-muted-foreground">メルマガが見つかりません</p>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">メルマガ編集</h1>
      <NewsletterForm newsletter={newsletter} />
    </div>
  )
}
