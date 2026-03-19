import { createClient } from '@/lib/supabase/server'
import { generateText } from '@/lib/gemini'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  const body = await request.json()
  const { template_html, template_name, theme, direction_memo, products } = body

  if (!template_html || !theme) {
    return NextResponse.json({ error: 'テンプレートとテーマは必須です' }, { status: 400 })
  }

  const productList = (products || [])
    .map((p: { product_name: string; product_url: string }, i: number) =>
      `${i + 1}. ${p.product_name || '（名前未取得）'} - ${p.product_url}`
    ).join('\n')

  const prompt = `あなたはBtoB向けメールマガジン制作のエキスパートです。

以下の情報を元に、メルマガの構成を提案してください。

## テンプレート名
${template_name || '未設定'}

## テンプレートHTML（構造を分析してください）
${template_html}

## 特集テーマ
${theme}

## 方向性メモ（ユーザーからの指示）
${direction_memo || '特になし'}

## 登録されている商品
${productList || '（未登録）'}

## 指示

テンプレートHTMLの構造を分析して、以下のJSON形式で提案を返してください。
JSONのみを返し、他のテキストは含めないでください。

\`\`\`json
{
  "proposal_summary": "このメルマガの構成提案を2-3文で説明",
  "sections": [
    {
      "section_id": "セクションを識別するID（例: hero, greeting, recommend, ranking, cta）",
      "section_name": "セクション名（例: ヘッダー画像, 挨拶文, おすすめ商品, ランキング, CTAボタン）",
      "section_type": "セクションの種類: header_image | greeting | recommend_title | product_list | ranking | cta | feature",
      "description": "このセクションで何を表示するかの説明",
      "questions": [
        {
          "question_id": "質問を識別するID",
          "question": "ユーザーへの質問文",
          "input_type": "入力タイプ: text | textarea | select | url | product_assignment",
          "options": ["selectの場合の選択肢（任意）"],
          "default_value": "AIが提案するデフォルト値",
          "required": true,
          "placeholder": "入力のヒント"
        }
      ]
    }
  ],
  "product_assignment": {
    "recommend_products": [商品のインデックス番号の配列（0始まり）],
    "ranking_products": [商品のインデックス番号の配列（0始まり）],
    "description": "商品の配置理由"
  }
}
\`\`\`

## 重要なルール

1. テンプレートHTMLの実際の構造に基づいてセクションを特定してください。テンプレートにないセクションは含めないでください。
2. 各セクションに対して、ユーザーが決定すべき項目を質問として生成してください。
3. 質問は具体的で答えやすいものにしてください。選択式にできるものは選択式にしてください。
4. default_valueにはAIの提案を入れてください。方向性メモがあればそれを反映してください。
5. 挨拶文は3パターン程度のデフォルト案を選択肢として提示してください。
6. 商品の配置（おすすめ/ランキング）は商品名とテーマから判断して提案してください。
7. CTAボタンがテンプレートにある場合、リンク先URLとボタンテキストの入力欄を必ず含めてください。
8. 容器なびのBtoB向けメルマガとして適切なトーンを心がけてください。
9. ヘッダー画像（header_image）セクションでは、画像URLを提案しないでください。代わりに「こんな画像を使うと効果的です」というアドバイスをtextareaで提案してください（例: 「丼ぶり容器の集合写真や、テイクアウトのシーンがわかるイメージ画像がおすすめです」）。画像URLの入力はユーザーが別途行います。requiredはfalseにしてください。
10. おすすめ商品のタイトル（section_type: recommend_title）は「おすすめタイトル」というセクション名にしてください。「特集タイトル」ではなく「おすすめタイトル」を使ってください。`

  try {
    const response = await generateText(prompt)

    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('AIからの応答をパースできませんでした')
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0]
    const proposal = JSON.parse(jsonStr)

    return NextResponse.json(proposal)
  } catch (err) {
    console.error('Proposal generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '提案の生成に失敗しました' },
      { status: 500 }
    )
  }
}
