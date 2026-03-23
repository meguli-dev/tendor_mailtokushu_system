import { createClient } from '@/lib/supabase/server'
import { generateText } from '@/lib/gemini'
import { NextResponse } from 'next/server'
import type { FeatureTemplateType } from '@/types'

export async function POST(
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
  const { template_type, direction_memo } = body as {
    template_type: FeatureTemplateType
    direction_memo?: string
  }

  // Fetch feature page with products
  const { data: page } = await supabase
    .from('feature_pages')
    .select('*')
    .eq('id', id)
    .single()

  if (!page) {
    return NextResponse.json({ error: '特集ページが見つかりません' }, { status: 404 })
  }

  const { data: products } = await supabase
    .from('feature_products')
    .select('*')
    .eq('feature_page_id', id)
    .order('sort_order')

  const productList = (products || []).map((p, i) =>
    `商品${i + 1}: 名前="${p.product_name || '未設定'}", URL="${p.product_url}", 説明="${p.description || ''}"`
  ).join('\n')

  const prompt = buildPrompt(template_type, page.title, productList, direction_memo)

  try {
    const response = await generateText(prompt)

    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('AIからの応答をパースできませんでした')
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0]
    const content = JSON.parse(jsonStr)

    return NextResponse.json({ content })
  } catch (err) {
    console.error('Feature content generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'コンテンツ生成に失敗しました' },
      { status: 500 }
    )
  }
}

function buildPrompt(
  templateType: FeatureTemplateType,
  title: string,
  productList: string,
  directionMemo?: string
): string {
  const baseContext = `あなたは容器なび（食品容器のBtoB通販サイト）の特集ページコンテンツ制作エキスパートです。
以下の情報をもとに、特集ページのコンテンツを生成してください。

## 特集テーマ
${title}

## 登録商品
${productList || '（商品未登録）'}

## 方向性・指示
${directionMemo || '特になし'}

## トーン
BtoB向けだが親しみやすい文体。具体的なメリットを訴求。`

  switch (templateType) {
    case 'new_product':
      return `${baseContext}

## 生成するコンテンツ（JSON形式で返してください）

\`\`\`json
{
  "badge_text": "（バッジテキスト、例: 新商品、おすすめ、注目 など短い言葉）",
  "problem_section_title": "（課題提起セクションのタイトル）",
  "problem_before": ["（従来の課題1）", "（従来の課題2）", "（従来の課題3）", "（従来の課題4）"],
  "problem_after": ["（解決後のメリット1）", "（解決後のメリット2）", "（解決後のメリット3）", "（解決後のメリット4）"],
  "solution_text": "（解決策の一言キャッチコピー。改行は<br>で）",
  "feature_section_title": "（特長セクションのタイトル、例: ○○の7つの特長）",
  "main_features": [
    {"title": "（特長1のタイトル）", "description": "（特長1の説明文）"},
    {"title": "（特長2のタイトル）", "description": "（特長2の説明文）"},
    {"title": "（特長3のタイトル）", "description": "（特長3の説明文）"}
  ],
  "sub_features": ["（特長4の短い説明）", "（特長5の短い説明）", "（特長6の短い説明）", "（特長7の短い説明）"],
  "use_cases": [
    {"title": "（利用シーン1のタイトル）", "description": "（利用シーン1の説明）"},
    {"title": "（利用シーン2のタイトル）", "description": "（利用シーン2の説明）"},
    {"title": "（利用シーン3のタイトル）", "description": "（利用シーン3の説明）"}
  ],
  "size_guide_title": "（選び方セクションのタイトル、不要なら空文字）",
  "size_guide": [
    {"label": "（選択肢1のラベル）", "specs": "（スペック）", "description": "（説明）"},
    {"label": "（選択肢2のラベル）", "specs": "（スペック）", "description": "（説明）"}
  ],
  "faq": [
    {"question": "（質問1）", "answer": "（回答1）"},
    {"question": "（質問2）", "answer": "（回答2）"},
    {"question": "（質問3）", "answer": "（回答3）"},
    {"question": "（質問4）", "answer": "（回答4）"}
  ],
  "cta_text": "（CTAボタンのテキスト）"
}
\`\`\`

JSONのみを返してください。`

    case 'category':
      return `${baseContext}

## 生成するコンテンツ（JSON形式で返してください）

\`\`\`json
{
  "intro_text": "（導入文。この特集で紹介する商品カテゴリの魅力を2-3文で説明）",
  "recommend_descriptions": ["（おすすめ商品1の説明文）", "（おすすめ商品2の説明文）"],
  "selection_guide_text": "（選び方ガイドのテキスト。どんなポイントで選べばよいかを説明）",
  "cta_text": "（CTAボタンのテキスト）"
}
\`\`\`

JSONのみを返してください。`

    case 'simple':
      return `${baseContext}

## 生成するコンテンツ（JSON形式で返してください）

\`\`\`json
{
  "appeal_text": "（訴求テキスト。この特集の魅力を3-4文で伝える。改行は<br>で）",
  "product_descriptions": ["（商品1の説明文）", "（商品2の説明文）", "（商品3の説明文）", "（商品4の説明文）", "（商品5の説明文）", "（商品6の説明文）"],
  "cta_text": "（CTAボタンのテキスト）"
}
\`\`\`

JSONのみを返してください。`
  }
}
