import { createClient } from '@/lib/supabase/server'
import { generateBannerImage } from '@/lib/gemini'
import { generateBannerImageOpenAI } from '@/lib/openai-image'
import { imageModelDef } from '@/lib/image-models'
import { bannerGenerateSchema } from '@/lib/validators'
import { uploadToS3 } from '@/lib/s3'
import { NextResponse } from 'next/server'

const MONTHLY_LIMIT = 60

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

    const modelDef = imageModelDef(parsed.data.image_model)

    // 月間生成数チェック（units = 消費枚数の合計。上限到達時はブロック）
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const { data: logs } = await supabase
      .from('banner_generation_logs')
      .select('units')
      .eq('user_id', user.id)
      .eq('is_edit', false)
      .gte('created_at', monthStart)

    const used = (logs || []).reduce((sum, l) => sum + (l.units ?? 1), 0)
    if (used + modelDef.units > MONTHLY_LIMIT) {
      return NextResponse.json({
        error: `月間生成上限（${MONTHLY_LIMIT}枚）に達しました（使用済み: ${used}枚）。上限の引き上げはお問い合わせください。`,
        usage: { used, limit: MONTHLY_LIMIT, remaining: Math.max(0, MONTHLY_LIMIT - used), isOverLimit: true },
      }, { status: 429 })
    }

    // トンマナ設定を取得
    const { data: tonmana } = await supabase
      .from('banner_tonmana')
      .select('*')
      .eq('user_id', user.id)
      .single()

    const genParams = {
      mainText: parsed.data.main_text,
      newsletterTitle: parsed.data.newsletter_title,
      subText: parsed.data.sub_text,
      width: parsed.data.width,
      height: parsed.data.height,
      productImages: parsed.data.product_images,
      referenceImageUrl: parsed.data.reference_image_url,
      pageContext: parsed.data.page_context,
      imageModel: parsed.data.image_model,
      tonmana: tonmana || null,
    }

    const result = modelDef.provider === 'openai'
      ? await generateBannerImageOpenAI(genParams)
      : await generateBannerImage(genParams)

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

    // Log generation (is_edit=false)
    await supabase.from('banner_generation_logs').insert({
      user_id: user.id,
      newsletter_id: parsed.data.newsletter_id || null,
      method: modelDef.provider,
      prompt: JSON.stringify(parsed.data),
      input_params: parsed.data,
      result_image_url: s3Url,
      status: 'generated',
      is_edit: false,
      units: modelDef.units,
    })

    const newUsed = used + modelDef.units
    return NextResponse.json({
      s3Url,
      s3Key,
      mimeType: result.mimeType,
      usage: {
        used: newUsed,
        limit: MONTHLY_LIMIT,
        remaining: Math.max(0, MONTHLY_LIMIT - newUsed),
        isOverLimit: newUsed >= MONTHLY_LIMIT,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '画像生成に失敗しました' },
      { status: 500 }
    )
  }
}
