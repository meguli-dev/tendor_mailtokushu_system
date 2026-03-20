import { createClient } from '@/lib/supabase/server'
import { scrapeProduct } from '@/lib/scraper'
import { uploadFromUrl } from '@/lib/s3'
import { scrapeSchema } from '@/lib/validators'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = scrapeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const scraped = await scrapeProduct(parsed.data.product_url)

    let s3ImageUrl: string | undefined

    if (parsed.data.auto_upload_s3 && scraped.imageUrl) {
      try {
        const filename = scraped.productId
          ? `${scraped.productId}_${scraped.imageUrl.split('/').pop()}`
          : scraped.imageUrl.split('/').pop() || 'image.jpg'

        const { s3Url, s3Key } = await uploadFromUrl(scraped.imageUrl, 'product', filename)
        s3ImageUrl = s3Url

        // Save to images table
        await supabase.from('images').insert({
          user_id: user.id,
          s3_key: s3Key,
          s3_url: s3Url,
          original_url: scraped.imageUrl,
          image_type: 'product',
          file_name: filename,
        })
      } catch (uploadError) {
        console.error('S3 upload failed:', uploadError)
        // Continue without S3 upload
      }
    }

    return NextResponse.json({
      product_name: scraped.productName,
      original_image_url: scraped.imageUrl,
      s3_image_url: s3ImageUrl,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '商品情報の取得に失敗しました' },
      { status: 500 }
    )
  }
}
