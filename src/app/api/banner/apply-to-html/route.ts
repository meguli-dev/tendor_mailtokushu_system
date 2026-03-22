import { generateText } from '@/lib/gemini'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { html, bannerUrl, bannerAlt } = await request.json()

    if (!html || !bannerUrl) {
      return NextResponse.json({ error: 'html と bannerUrl は必須です' }, { status: 400 })
    }

    const prompt = `あなたはメールHTMLの編集エキスパートです。

以下のメルマガHTMLに、バナー画像を挿入してください。

## バナー画像のHTMLタグ
\`\`\`html
<tr>
<td>
<img src="${bannerUrl}" alt="${bannerAlt || 'バナー'}" width="600" style="display:block;width:100%;height:auto;" />
</td>
</tr>
\`\`\`

## 挿入ルール
1. バナー画像はヘッダー（ロゴ・ナビゲーション）の**直後**、挨拶文（GREETING）の**直前**に配置してください。ヘッダーの上ではありません。
2. **<!--[if mso]>...<![endif]--> 条件コメントの中には絶対に入れないでください。** ブラウザで表示される本文のtable内に入れてください。
3. 既にバナー画像（width="600" の全幅img を含む<tr>）が本文内にある場合は、それを新しいバナーに**置換**してください（重複させない）。
4. HTMLの構造・スタイル・他のコンテンツは**一切変更しないでください**。バナーの挿入/置換のみ行ってください。
5. HTMLコードのみを返してください。\`\`\`html 等のマークダウン記法は含めないでください。

## メルマガHTML
${html}`

    let result = await generateText(prompt)

    // マークダウンコードブロックを除去
    result = result.trim()
    if (result.startsWith('```html')) {
      result = result.replace(/^```html\s*/, '').replace(/\s*```$/, '')
    } else if (result.startsWith('```')) {
      result = result.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }

    return NextResponse.json({ html: result })
  } catch (err) {
    console.error('Banner apply error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'バナー適用に失敗しました' },
      { status: 500 }
    )
  }
}
