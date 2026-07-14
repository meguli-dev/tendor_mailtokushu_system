import { createClient } from '@/lib/supabase/server'
import { editBannerImage } from '@/lib/gemini'
import { editBannerImageOpenAI } from '@/lib/openai-image'
import { IMAGE_MODEL_IDS, DEFAULT_IMAGE_MODEL, imageModelDef } from '@/lib/image-models'
import { uploadToS3 } from '@/lib/s3'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const editSchema = z.object({
  base_image_url: z.string().min(1),
  edit_instruction: z.string().min(1, '修正指示を入力してください'),
  image_model: z.enum(IMAGE_MODEL_IDS).default(DEFAULT_IMAGE_MODEL),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = editSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const modelDef = imageModelDef(parsed.data.image_model)
    const editParams = {
      baseImageUrl: parsed.data.base_image_url,
      editInstruction: parsed.data.edit_instruction,
      imageModel: parsed.data.image_model,
    }
    const result = modelDef.provider === 'openai'
      ? await editBannerImageOpenAI(editParams)
      : await editBannerImage(editParams)

    // Upload edited image to S3
    const ext = result.mimeType === 'image/png' ? 'png' : 'jpg'
    const buffer = Buffer.from(result.imageData, 'base64')
    const { s3Key, s3Url } = await uploadToS3(
      buffer,
      `banner-edited.${ext}`,
      result.mimeType,
      'banner'
    )

    // Save image record
    await supabase.from('images').insert({
      user_id: user.id,
      s3_key: s3Key,
      s3_url: s3Url,
      image_type: 'banner',
      file_name: `banner-edited.${ext}`,
      file_size: buffer.length,
    })

    // Log edit (is_edit=true, カウント対象外)
    await supabase.from('banner_generation_logs').insert({
      user_id: user.id,
      method: modelDef.provider,
      prompt: parsed.data.edit_instruction,
      input_params: parsed.data,
      result_image_url: s3Url,
      status: 'generated',
      is_edit: true,
    })

    return NextResponse.json({ s3Url, s3Key, mimeType: result.mimeType })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '画像編集に失敗しました' },
      { status: 500 }
    )
  }
}
