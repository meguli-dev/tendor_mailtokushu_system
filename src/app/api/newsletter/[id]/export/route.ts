import { createClient } from '@/lib/supabase/server'
import { generateNewsletterWithAI } from '@/lib/ai-template'
import { NextResponse } from 'next/server'
import type { NewsletterTemplate } from '@/types'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  // Request body contains user answers, form fields, and product assignments
  const body = await request.json().catch(() => ({}))
  const {
    answers,
    subject,
    product_assignments,
    direction_memo,
    header,
    greeting,
    recommend,
    sub_section,
    cta,
    feature,
    content_zone,
  } = body as {
    answers?: Record<string, string>
    subject?: string
    product_assignments?: {
      recommend: number[]
      ranking: number[]
    }
    direction_memo?: string
    header?: { image_url: string } | null
    greeting?: string
    recommend?: { title: string; tags: string[] }
    sub_section?: {
      type: 'ranking' | 'product_intro'
      title: string
      products: Array<{
        product_url: string
        product_name: string | null
        product_image_url: string | null
        s3_image_url: string | null
      }>
      tags: string[]
    } | null
    cta?: { text: string; url: string }
    feature?: { title: string; description: string }
    content_zone?: Array<{ image_url: string; link_url: string; text: string }>
  }

  // Fetch newsletter
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

  const allProducts = products || []

  // Build product list with role assignments
  const assignedProducts = allProducts.map((p, index) => {
    let role: 'recommend' | 'ranking' = 'recommend'
    let position = index

    if (product_assignments) {
      const recIdx = product_assignments.recommend.indexOf(index)
      const rankIdx = product_assignments.ranking.indexOf(index)
      if (rankIdx >= 0) {
        role = 'ranking'
        position = rankIdx
      } else if (recIdx >= 0) {
        position = recIdx
      }
    } else {
      // Fallback: use is_ranking flag from DB
      role = p.is_ranking ? 'ranking' : 'recommend'
      position = p.is_ranking ? (p.rank_position || index) : p.sort_order
    }

    return {
      product_name: p.product_name,
      product_image_url: p.product_image_url,
      s3_image_url: p.s3_image_url,
      product_url: p.product_url,
      role,
      position,
    }
  })

  try {
    const html = await generateNewsletterWithAI({
      templateHtml: (template as NewsletterTemplate).html_template,
      theme: newsletter.title,
      subject: subject || newsletter.title,
      directionMemo: direction_memo || newsletter.feature_description || undefined,
      answers: answers || {},
      products: assignedProducts,
      formFields: {
        header,
        greeting,
        recommend,
        subSection: sub_section,
        cta,
        feature,
        contentZone: content_zone,
      },
    })

    // Save generated HTML
    await supabase
      .from('newsletters')
      .update({ html_output: html, status: 'exported' })
      .eq('id', id)

    return NextResponse.json({ html })
  } catch (err) {
    console.error('Newsletter generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'HTML生成に失敗しました' },
      { status: 500 }
    )
  }
}
