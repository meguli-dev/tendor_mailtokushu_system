import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { FeatureTemplateType, FeaturePageDraftData } from '@/types'
import {
  computeThemeColors,
  getTemplateA, mainFeatureCard, subFeatureCard, useCaseCard, productCard, sizeGuideCard, faqItem, categoryTitle,
  getTemplateB, recommendProductCard, gridProductCard,
  getTemplateC, simpleProductCard,
} from '@/lib/feature-templates'

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

  const body = await request.json().catch(() => ({}))

  const { data: page } = await supabase
    .from('feature_pages')
    .select('*')
    .eq('id', id)
    .single()

  if (!page) {
    return NextResponse.json({ error: '特集ページが見つかりません' }, { status: 404 })
  }

  const templateType = (page.template_type || body.template_type) as FeatureTemplateType
  if (!templateType) {
    return NextResponse.json({ error: 'テンプレートタイプが設定されていません' }, { status: 400 })
  }

  const { data: products } = await supabase
    .from('feature_products')
    .select('*')
    .eq('feature_page_id', id)
    .order('sort_order')

  const allProducts = products || []
  const draft = (page.draft_data || body.draft_data || {}) as FeaturePageDraftData
  const fields = draft.formFields || {}
  const colors = computeThemeColors(page.theme_color || '#e8690a')

  let html = ''

  switch (templateType) {
    case 'new_product':
      html = buildNewProductHtml(page.title, fields, allProducts, colors)
      break
    case 'category':
      html = buildCategoryHtml(page.title, fields, allProducts, colors)
      break
    case 'simple':
      html = buildSimpleHtml(page.title, fields, allProducts, colors)
      break
  }

  await supabase
    .from('feature_pages')
    .update({ html_output: html, status: 'published' })
    .eq('id', id)

  return NextResponse.json({ html })
}

interface ProductRow {
  product_name: string | null
  product_url: string
  s3_image_url: string | null
  description: string | null
}

type Colors = ReturnType<typeof computeThemeColors>
type Fields = NonNullable<FeaturePageDraftData['formFields']>

function buildNewProductHtml(title: string, fields: Fields, products: ProductRow[], colors: Colors): string {
  let html = getTemplateA(colors)

  // Basic replacements
  html = html.replace(/\{\{PAGE_TITLE\}\}/g, title)
  html = html.replace('{{HERO_IMAGE}}', fields.heroImageUrl || '')
  html = html.replace('{{BADGE_TEXT}}', fields.badgeText || '')
  html = html.replace('{{PROBLEM_SECTION_TITLE}}', fields.problemSectionTitle || '')
  html = html.replace('{{SOLUTION_TEXT}}', fields.solutionText || '')
  html = html.replace('{{FEATURE_SECTION_TITLE}}', fields.mainFeatures ? `${title}の特長` : '')
  html = html.replace('{{CTA_URL}}', fields.ctaUrl || '#')
  html = html.replace('{{CTA_TEXT}}', fields.ctaText || '商品を見る')

  // Problem before/after items
  const beforeItems = (fields.problemBefore || [])
    .map(t => `<li style="padding:6px 0;border-bottom:1px solid ${colors.themeColorDark};">✕ ${t}</li>`)
    .join('\n')
  html = html.replace('{{PROBLEM_BEFORE_ITEMS}}', beforeItems)

  const afterItems = (fields.problemAfter || [])
    .map(t => `<li style="padding:6px 0;border-bottom:1px solid ${colors.themeColorDark};">◎ ${t}</li>`)
    .join('\n')
  html = html.replace('{{PROBLEM_AFTER_ITEMS}}', afterItems)

  // Main features
  const mainFeaturesHtml = (fields.mainFeatures || [])
    .map((f, i) => mainFeatureCard(i + 1, f.title, f.description, colors.themeColor))
    .join('\n')
  html = html.replace('{{MAIN_FEATURES}}', mainFeaturesHtml)

  // Sub features
  const subFeaturesHtml = (fields.subFeatures || [])
    .map((t, i) => subFeatureCard(i + 4, t, colors.themeColor, colors.themeColorLight, colors.themeColorDark))
    .join('\n')
  html = html.replace('{{SUB_FEATURES}}', subFeaturesHtml)

  // Product lineup
  const productLineupHtml = products
    .map(p => productCard(
      p.product_name || '商品',
      p.s3_image_url || '',
      p.product_url,
      p.description || '',
      ''
    ))
    .join('\n')
  html = html.replace('{{PRODUCT_LINEUP}}',
    `<div style="display:flex;gap:20px;flex-wrap:wrap;justify-content:center;margin-bottom:32px;">\n${productLineupHtml}\n</div>`
  )

  // Use cases
  const useCasesHtml = (fields.useCases || [])
    .map(uc => useCaseCard(uc.title, uc.description, colors.themeColor))
    .join('\n')
  html = html.replace('{{USE_CASES}}', useCasesHtml)

  // Size guide
  html = html.replace('{{SIZE_GUIDE_TITLE}}', fields.sizeGuide?.length ? (fields.directionMemo || 'サイズの選び方') : '')
  const sizeGuideHtml = (fields.sizeGuide || [])
    .map(sg => sizeGuideCard(sg.label, sg.specs, sg.description, colors.themeColor))
    .join('\n')
  html = html.replace('{{SIZE_GUIDE_ITEMS}}', sizeGuideHtml)

  // FAQ
  const faqHtml = (fields.faqItems || [])
    .map(f => faqItem(f.question, f.answer))
    .join('\n')
  html = html.replace('{{FAQ_ITEMS}}', faqHtml)

  // Handle conditional blocks
  html = processConditionals(html)

  return html
}

function buildCategoryHtml(title: string, fields: Fields, products: ProductRow[], colors: Colors): string {
  let html = getTemplateB(colors)

  html = html.replace(/\{\{PAGE_TITLE\}\}/g, title)
  html = html.replace('{{HERO_IMAGE}}', fields.heroImageUrl || '')
  html = html.replace('{{INTRO_TEXT}}', fields.introText || '')
  html = html.replace('{{CTA_URL}}', fields.ctaUrl || '#')
  html = html.replace('{{CTA_TEXT}}', fields.ctaText || '商品を見る')
  html = html.replace('{{SELECTION_GUIDE_TEXT}}', fields.selectionGuideText || '')

  // Recommend products (first 2)
  const recommendHtml = products.slice(0, 2)
    .map(p => recommendProductCard(
      p.product_name || '商品',
      p.s3_image_url || '',
      p.product_url,
      p.description || '',
      colors.themeColor
    ))
    .join('\n')
  html = html.replace('{{RECOMMEND_PRODUCTS}}', recommendHtml)

  // Product grid (rest)
  const gridHtml = products.slice(2)
    .map(p => gridProductCard(
      p.product_name || '商品',
      p.s3_image_url || '',
      p.product_url,
      p.description || ''
    ))
    .join('\n')
  html = html.replace('{{PRODUCT_GRID}}', gridHtml)

  html = processConditionals(html)
  return html
}

function buildSimpleHtml(title: string, fields: Fields, products: ProductRow[], colors: Colors): string {
  let html = getTemplateC(colors)

  html = html.replace(/\{\{PAGE_TITLE\}\}/g, title)
  html = html.replace('{{HERO_IMAGE}}', fields.heroImageUrl || '')
  html = html.replace('{{APPEAL_TEXT}}', fields.appealText || '')
  html = html.replace('{{CTA_URL}}', fields.ctaUrl || '#')
  html = html.replace('{{CTA_TEXT}}', fields.ctaText || '商品を見る')

  const productListHtml = products
    .map(p => simpleProductCard(
      p.product_name || '商品',
      p.s3_image_url || '',
      p.product_url,
      p.description || '',
      colors.themeColor
    ))
    .join('\n')
  html = html.replace('{{PRODUCT_LIST}}', productListHtml)

  html = processConditionals(html)
  return html
}

/** 条件ブロックを処理: 値がある→IF/ENDIFコメント除去、値がない→ブロック全体削除 */
function processConditionals(html: string): string {
  return html.replace(
    /<!--IF:(\w+)-->([\s\S]*?)<!--ENDIF:\1-->/g,
    (_, varName, content) => {
      // Check if the content has any actual values (not just whitespace/empty placeholders)
      const hasContent = content.replace(/\{\{[^}]+\}\}/g, '').trim().length > 0
        && !content.includes('{{' + varName + '}}')
      return hasContent ? content : ''
    }
  )
}
