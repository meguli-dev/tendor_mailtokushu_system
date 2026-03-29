import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  const { data } = await supabase
    .from('banner_tonmana')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json(data || null)
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  const body = await request.json()
  const {
    design_style,
    color_primary,
    color_accent,
    color_background,
    font_style,
    atmosphere,
    ng_elements,
    reference_image_url,
    additional_instructions,
  } = body

  const { data, error } = await supabase
    .from('banner_tonmana')
    .upsert({
      user_id: user.id,
      design_style: design_style || 'clean',
      color_primary: color_primary || '#e8690a',
      color_accent: color_accent || '#2563eb',
      color_background: color_background || 'warm',
      font_style: font_style || 'bold_readable',
      atmosphere: atmosphere || '',
      ng_elements: ng_elements || '',
      reference_image_url: reference_image_url || null,
      additional_instructions: additional_instructions || '',
    }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
