import { createClient } from '@/lib/supabase/server'
import { uploadFromUrl } from '@/lib/s3'
import { NextResponse } from 'next/server'
import type { ImageType } from '@/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { url, image_type = 'other' } = body as { url: string; image_type?: ImageType }

    if (!url) {
      return NextResponse.json({ error: 'URLが指定されていません' }, { status: 400 })
    }

    const { s3Key, s3Url } = await uploadFromUrl(url, image_type)
    const filename = url.split('/').pop()?.split('?')[0] || 'image.jpg'

    const { data, error } = await supabase
      .from('images')
      .insert({
        user_id: user.id,
        s3_key: s3Key,
        s3_url: s3Url,
        original_url: url,
        image_type,
        file_name: filename,
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
