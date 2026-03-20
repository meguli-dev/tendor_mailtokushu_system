import { createClient } from '@/lib/supabase/server'
import { featurePageSchema } from '@/lib/validators'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: featurePage, error } = await supabase
    .from('feature_pages')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: '特集ページが見つかりません' }, { status: 404 })
  }

  const { data: products } = await supabase
    .from('feature_products')
    .select('*')
    .eq('feature_page_id', id)
    .order('sort_order')

  const { data: template } = featurePage.template_id
    ? await supabase
        .from('feature_templates')
        .select('*')
        .eq('id', featurePage.template_id)
        .single()
    : { data: null }

  return NextResponse.json({
    ...featurePage,
    products: products || [],
    template,
  })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  const body = await request.json()
  const { products, ...pageData } = body

  const parsed = featurePageSchema.partial().safeParse(pageData)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('feature_pages')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (products && Array.isArray(products)) {
    await supabase.from('feature_products').delete().eq('feature_page_id', id)
    if (products.length > 0) {
      await supabase.from('feature_products').insert(
        products.map((p: Record<string, unknown>, i: number) => ({
          ...p,
          feature_page_id: id,
          sort_order: p.sort_order ?? i,
        }))
      )
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  const { error } = await supabase.from('feature_pages').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
