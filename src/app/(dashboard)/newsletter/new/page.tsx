'use client'

import { NewsletterForm } from '@/components/newsletter/newsletter-form'

export default function NewNewsletterPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">メルマガ作成</h1>
      <NewsletterForm />
    </div>
  )
}
