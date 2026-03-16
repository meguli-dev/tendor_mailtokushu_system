import { createClient } from '@/lib/supabase/server'
import { generateBannerImage } from '@/lib/gemini'
import { bannerGenerateSchema } from '@/lib/validators'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = bannerGenerateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }

    const result = await generateBannerImage({
      templatePattern: parsed.data.template_pattern || 'default',
      productImages: parsed.data.product_images,
      mainText: parsed.data.main_text,
      subText: parsed.data.sub_text,
      width: parsed.data.width,
      height: parsed.data.height,
      pageContext: parsed.data.page_context,
    })

    // Log generation
    await supabase.from('banner_generation_logs').insert({
      user_id: user.id,
      method: 'gemini',
      prompt: JSON.stringify(parsed.data),
      input_params: parsed.data,
      status: 'generated',
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '画像生成に失敗しました' },
      { status: 500 }
    )
  }
}
