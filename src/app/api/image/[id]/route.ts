import { createClient } from '@/lib/supabase/server'
import { deleteFromS3 } from '@/lib/s3'
import { NextResponse } from 'next/server'

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

  // Get image to find S3 key
  const { data: image } = await supabase
    .from('images')
    .select('s3_key')
    .eq('id', id)
    .single()

  if (!image) {
    return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 })
  }

  // Delete from S3
  try {
    await deleteFromS3(image.s3_key)
  } catch (err) {
    console.error('S3 delete failed:', err)
  }

  // Delete from DB
  const { error } = await supabase.from('images').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
