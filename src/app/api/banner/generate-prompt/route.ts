import { createClient } from '@/lib/supabase/server'
import { buildGenSparkPrompt } from '@/lib/prompt-builder'
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
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const prompt = buildGenSparkPrompt({
      referenceImageUrl: parsed.data.reference_image_url,
      productImages: parsed.data.product_images.map((url, i) => ({
        url,
        name: `商品${i + 1}`,
      })),
      mainText: parsed.data.main_text,
      subText: parsed.data.sub_text,
      width: parsed.data.width,
      height: parsed.data.height,
      pageContext: parsed.data.page_context,
    })

    // Log generation
    await supabase.from('banner_generation_logs').insert({
      user_id: user.id,
      method: 'genspark_prompt',
      prompt,
      input_params: parsed.data,
      status: 'generated',
    })

    return NextResponse.json({
      prompt,
      reference_images: parsed.data.reference_image_url ? [parsed.data.reference_image_url] : [],
      product_images: parsed.data.product_images,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'プロンプト生成に失敗しました' },
      { status: 500 }
    )
  }
}
