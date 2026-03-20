import { createClient } from '@/lib/supabase/server'
import { newsletterSchema } from '@/lib/validators'
import { deleteFromS3 } from '@/lib/s3'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: newsletter, error } = await supabase
    .from('newsletters')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: 'メルマガが見つかりません' }, { status: 404 })
  }

  const { data: products } = await supabase
    .from('newsletter_products')
    .select('*')
    .eq('newsletter_id', id)
    .order('sort_order')

  const { data: template } = newsletter.template_id
    ? await supabase
        .from('newsletter_templates')
        .select('*')
        .eq('id', newsletter.template_id)
        .single()
    : { data: null }

  return NextResponse.json({
    ...newsletter,
    products: products || [],
    template,
  })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  const body = await request.json()

  // Handle products separately if included
  const { products, ...newsletterData } = body

  const parsed = newsletterSchema.partial().safeParse(newsletterData)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('newsletters')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update products if provided
  if (products && Array.isArray(products)) {
    // Delete existing products
    await supabase
      .from('newsletter_products')
      .delete()
      .eq('newsletter_id', id)

    // Insert new products
    if (products.length > 0) {
      const productsWithNewsletterId = products.map((p: Record<string, unknown>, i: number) => ({
        ...p,
        newsletter_id: id,
        sort_order: p.sort_order ?? i,
      }))

      await supabase
        .from('newsletter_products')
        .insert(productsWithNewsletterId)
    }
  }

  return NextResponse.json(data)
}

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

  // 関連する商品のS3画像を削除
  const { data: products } = await supabase
    .from('newsletter_products')
    .select('s3_image_url')
    .eq('newsletter_id', id)

  // imagesテーブルから関連画像を取得して削除
  const { data: images } = await supabase
    .from('images')
    .select('id, s3_key')
    .eq('user_id', user.id)

  // newsletter_productsのs3_image_urlからS3キーを抽出して削除
  const s3DeletePromises: Promise<void>[] = []

  if (products) {
    for (const p of products) {
      if (p.s3_image_url) {
        // URLからS3キーを抽出 (https://bucket.s3.region.amazonaws.com/KEY)
        try {
          const url = new URL(p.s3_image_url)
          const s3Key = url.pathname.slice(1) // 先頭の / を除去
          if (s3Key) {
            s3DeletePromises.push(deleteFromS3(s3Key))

            // imagesテーブルからも該当レコードを削除
            if (images) {
              const matchedImage = images.find(img => img.s3_key === s3Key)
              if (matchedImage) {
                s3DeletePromises.push(
                  supabase.from('images').delete().eq('id', matchedImage.id).then(() => { /* void */ }) as Promise<void>
                )
              }
            }
          }
        } catch {
          // URL解析失敗は無視
        }
      }
    }
  }

  // ヘッダー画像のS3削除
  const { data: newsletter } = await supabase
    .from('newsletters')
    .select('header_image_url')
    .eq('id', id)
    .single()

  if (newsletter?.header_image_url) {
    try {
      const url = new URL(newsletter.header_image_url)
      if (url.hostname.includes('s3') && url.hostname.includes('amazonaws.com')) {
        const s3Key = url.pathname.slice(1)
        if (s3Key) {
          s3DeletePromises.push(deleteFromS3(s3Key))
          if (images) {
            const matchedImage = images.find(img => img.s3_key === s3Key)
            if (matchedImage) {
              s3DeletePromises.push(
                supabase.from('images').delete().eq('id', matchedImage.id).then(() => { /* void */ }) as Promise<void>
              )
            }
          }
        }
      }
    } catch {
      // URL解析失敗は無視
    }
  }

  // S3削除を並行実行（失敗してもDB削除は続行）
  await Promise.allSettled(s3DeletePromises)

  // メルマガ本体を削除（cascade で newsletter_products も削除される）
  const { error } = await supabase
    .from('newsletters')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
