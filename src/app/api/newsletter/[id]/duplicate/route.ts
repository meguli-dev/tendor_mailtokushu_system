import { createClient } from '@/lib/supabase/server'
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

  // Fetch original
  const { data: original, error } = await supabase
    .from('newsletters')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !original) {
    return NextResponse.json({ error: 'メルマガが見つかりません' }, { status: 404 })
  }

  // Create copy
  const { id: _id, created_at, updated_at, html_output, status, ...copyData } = original
  const { data: newNewsletter, error: insertError } = await supabase
    .from('newsletters')
    .insert({
      ...copyData,
      title: `${original.title} (コピー)`,
      status: 'draft',
      user_id: user.id,
    })
    .select()
    .single()

  if (insertError || !newNewsletter) {
    return NextResponse.json({ error: '複製に失敗しました' }, { status: 500 })
  }

  // Copy products
  const { data: products } = await supabase
    .from('newsletter_products')
    .select('*')
    .eq('newsletter_id', id)

  if (products && products.length > 0) {
    const newProducts = products.map(({ id: _pid, newsletter_id, created_at, updated_at, ...p }) => ({
      ...p,
      newsletter_id: newNewsletter.id,
    }))

    await supabase.from('newsletter_products').insert(newProducts)
  }

  return NextResponse.json(newNewsletter, { status: 201 })
}
