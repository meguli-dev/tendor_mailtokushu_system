import { createClient } from '@/lib/supabase/server'
import { generateNewsletterHtml } from '@/lib/html-generator'
import { NextResponse } from 'next/server'
import type { NewsletterWithProducts, NewsletterTemplate } from '@/types'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  // Fetch newsletter with products
  const { data: newsletter, error: nlError } = await supabase
    .from('newsletters')
    .select('*')
    .eq('id', id)
    .single()

  if (nlError || !newsletter) {
    return NextResponse.json({ error: 'メルマガが見つかりません' }, { status: 404 })
  }

  if (!newsletter.template_id) {
    return NextResponse.json({ error: 'テンプレートが選択されていません' }, { status: 400 })
  }

  const { data: template } = await supabase
    .from('newsletter_templates')
    .select('*')
    .eq('id', newsletter.template_id)
    .single()

  if (!template) {
    return NextResponse.json({ error: 'テンプレートが見つかりません' }, { status: 404 })
  }

  const { data: products } = await supabase
    .from('newsletter_products')
    .select('*')
    .eq('newsletter_id', id)
    .order('sort_order')

  const newsletterWithProducts: NewsletterWithProducts = {
    ...newsletter,
    products: products || [],
    template: template as NewsletterTemplate,
  }

  const html = generateNewsletterHtml(newsletterWithProducts, template as NewsletterTemplate)

  // Save generated HTML
  await supabase
    .from('newsletters')
    .update({ html_output: html, status: 'exported' })
    .eq('id', id)

  return NextResponse.json({ html })
}
