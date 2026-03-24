'use client'

import { use } from 'react'
import { useFeaturePage } from '@/hooks/use-feature-pages'
import { FeaturePageForm } from '@/components/feature/feature-page-form'
import { Skeleton } from '@/components/ui/skeleton'

export default function EditFeaturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: featurePage, isLoading } = useFeaturePage(id)

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  return <FeaturePageForm featurePage={featurePage} />
}
