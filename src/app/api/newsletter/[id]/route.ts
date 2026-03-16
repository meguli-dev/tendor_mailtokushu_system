import { createClient } from '@/lib/supabase/server'
import { newsletterSchema } from '@/lib/validators'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: newsletter, error } = await supabase
    .from('newsletters')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: 'メルマガが見つかりません' }, { status: 404 })
  }

  const { data: products } = await supabase
    .from('newsletter_products')
    .select('*')
    .eq('newsletter_id', id)
    .order('sort_order')

  const { data: template } = newsletter.template_id
    ? await supabase
        .from('newsletter_templates')
        .select('*')
        .eq('id', newsletter.template_id)
        .single()
    : { data: null }

  return NextResponse.json({
    ...newsletter,
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

  // Handle products separately if included
  const { products, ...newsletterData } = body

  const parsed = newsletterSchema.partial().safeParse(newsletterData)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('newsletters')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update products if provided
  if (products && Array.isArray(products)) {
    // Delete existing products
    await supabase
      .from('newsletter_products')
      .delete()
      .eq('newsletter_id', id)

    // Insert new products
    if (products.length > 0) {
      const productsWithNewsletterId = products.map((p: Record<string, unknown>, i: number) => ({
        ...p,
        newsletter_id: id,
        sort_order: p.sort_order ?? i,
      }))

      await supabase
        .from('newsletter_products')
        .insert(productsWithNewsletterId)
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

  const { error } = await supabase
    .from('newsletters')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
