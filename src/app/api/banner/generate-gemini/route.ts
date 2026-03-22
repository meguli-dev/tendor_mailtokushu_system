import { createClient } from '@/lib/supabase/server'
import { generateBannerImage } from '@/lib/gemini'
import { bannerGenerateSchema } from '@/lib/validators'
import { uploadToS3 } from '@/lib/s3'
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

    const result = await generateBannerImage({
      mainText: parsed.data.main_text,
      newsletterTitle: parsed.data.newsletter_title,
      subText: parsed.data.sub_text,
      width: parsed.data.width,
      height: parsed.data.height,
      productImages: parsed.data.product_images,
      referenceImageUrl: parsed.data.reference_image_url,
      pageContext: parsed.data.page_context,
    })

    // Upload generated image to S3
    const ext = result.mimeType === 'image/png' ? 'png' : 'jpg'
    const buffer = Buffer.from(result.imageData, 'base64')
    const { s3Key, s3Url } = await uploadToS3(
      buffer,
      `banner-generated.${ext}`,
      result.mimeType,
      'banner'
    )

    // Save image record
    await supabase.from('images').insert({
      user_id: user.id,
      s3_key: s3Key,
      s3_url: s3Url,
      image_type: 'banner',
      file_name: `banner-generated.${ext}`,
      file_size: buffer.length,
    })

    // Log generation
    await supabase.from('banner_generation_logs').insert({
      user_id: user.id,
      method: 'gemini',
      prompt: JSON.stringify(parsed.data),
      input_params: parsed.data,
      result_image_url: s3Url,
      status: 'generated',
    })

    return NextResponse.json({ s3Url, s3Key, mimeType: result.mimeType })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '画像生成に失敗しました' },
      { status: 500 }
    )
  }
}
