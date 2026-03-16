'use client'

import { TemplateEditor } from '@/components/templates/template-editor'

export default function NewTemplatePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">新規テンプレート作成</h1>
      <TemplateEditor />
    </div>
  )
}
