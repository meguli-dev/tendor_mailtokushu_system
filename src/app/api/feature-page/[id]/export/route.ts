import { createClient } from '@/lib/supabase/server'
import { generateFromTemplate } from '@/lib/html-generator'
import { NextResponse } from 'next/server'

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

  const { data: featurePage } = await supabase
    .from('feature_pages')
    .select('*')
    .eq('id', id)
    .single()

  if (!featurePage) {
    return NextResponse.json({ error: '特集ページが見つかりません' }, { status: 404 })
  }

  if (!featurePage.template_id) {
    return NextResponse.json({ error: 'テンプレートが選択されていません' }, { status: 400 })
  }

  const { data: template } = await supabase
    .from('feature_templates')
    .select('*')
    .eq('id', featurePage.template_id)
    .single()

  if (!template) {
    return NextResponse.json({ error: 'テンプレートが見つかりません' }, { status: 404 })
  }

  const { data: products } = await supabase
    .from('feature_products')
    .select('*')
    .eq('feature_page_id', id)
    .order('sort_order')

  const variables: Record<string, string | undefined> = {
    HEADER_IMAGE: featurePage.header_image_url || undefined,
    FEATURE_TITLE: featurePage.title,
  }

  ;(products || []).forEach((p: Record<string, unknown>, i: number) => {
    const num = i + 1
    variables[`PRODUCT_${num}_NAME`] = (p.product_name as string) || undefined
    variables[`PRODUCT_${num}_IMAGE`] = (p.s3_image_url as string) || undefined
    variables[`PRODUCT_${num}_URL`] = (p.product_url as string) || undefined
    variables[`PRODUCT_${num}_DESCRIPTION`] = (p.description as string) || undefined
  })

  const html = generateFromTemplate(template.html_template, variables)

  await supabase
    .from('feature_pages')
    .update({ html_output: html, status: 'published' })
    .eq('id', id)

  return NextResponse.json({ html })
}
