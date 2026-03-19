import { createClient } from '@/lib/supabase/server'
import { analyzeHtmlToTemplate } from '@/lib/ai-template'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  const body = await request.json()
  const { html } = body

  if (!html || typeof html !== 'string') {
    return NextResponse.json({ error: 'HTMLを入力してください' }, { status: 400 })
  }

  try {
    const result = await analyzeHtmlToTemplate(html)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Template analysis error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'テンプレート解析に失敗しました' },
      { status: 500 }
    )
  }
}
