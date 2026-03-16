import { createClient } from '@/lib/supabase/server'
import { uploadToS3 } from '@/lib/s3'
import { NextResponse } from 'next/server'
import type { ImageType } from '@/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const imageType = (formData.get('image_type') as ImageType) || 'other'

    if (!file) {
      return NextResponse.json({ error: 'ファイルが指定されていません' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { s3Key, s3Url } = await uploadToS3(buffer, file.name, file.type, imageType)

    const { data, error } = await supabase
      .from('images')
      .insert({
        user_id: user.id,
        s3_key: s3Key,
        s3_url: s3Url,
        image_type: imageType,
        file_name: file.name,
        file_size: file.size,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'アップロードに失敗しました' },
      { status: 500 }
    )
  }
}
