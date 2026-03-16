import { createClient } from '@/lib/supabase/server'
import { newsletterTemplateSchema } from '@/lib/validators'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('newsletter_templates')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: 'テンプレートが見つかりません' }, { status: 404 })
  }

  return NextResponse.json(data)
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
  const parsed = newsletterTemplateSchema.partial().safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('newsletter_templates')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
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
    .from('newsletter_templates')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
