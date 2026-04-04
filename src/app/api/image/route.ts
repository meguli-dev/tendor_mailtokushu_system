import { createClient } from '@/lib/supabase/server'
import { getPublicUrl } from '@/lib/s3'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('images')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Ensure all images use public URLs (fixes expired presigned URLs)
  const images = data?.map((img) => ({
    ...img,
    s3_url: img.s3_key ? getPublicUrl(img.s3_key) : img.s3_url,
  }))

  return NextResponse.json(images)
}
