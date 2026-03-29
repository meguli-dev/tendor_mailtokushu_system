import { generateText } from './gemini'

/**
 * AIが完成HTMLを解析して、プレースホルダー付きテンプレートに変換する
 */
export async function analyzeHtmlToTemplate(rawHtml: string): Promise<{
  html_template: string
  product_count: number
  has_ranking: boolean
  description: string
}> {
  const prompt = `あなたはメールマガジンHTMLテンプレートのエキスパートです。

以下の完成されたメルマガHTMLを解析して、再利用可能なテンプレートに変換してください。

## 指示

1. HTMLの構造とレイアウト（table構造、スタイル、配色、フッター等）はそのまま保持してください。
2. 以下の可変コンテンツ部分をプレースホルダーに置き換えてください:
   - メインのヘッダー画像（hero画像）→ {{HEADER_IMAGE}}
   - メルマガのタイトル（titleタグやh1等）→ {{NEWSLETTER_TITLE}}
   - 特集セクションのタイトル → {{FEATURE_TITLE}}
   - 特集セクションの説明文 → {{FEATURE_DESCRIPTION}}
   - 挨拶文・リード文 → {{GREETING_TEXT}}
   - 通常の商品（おすすめ等）は以下に置換:
     - 商品名 → {{PRODUCT_N_NAME}}（Nは1から連番）
     - 商品画像URL → {{PRODUCT_N_IMAGE}}
     - 商品リンクURL → {{PRODUCT_N_URL}}
     - 商品説明文 → {{PRODUCT_N_DESCRIPTION}}
     - 商品バッジ/ラベル → {{PRODUCT_N_BADGE}}
   - ランキング商品がある場合:
     - 商品名 → {{RANKING_N_NAME}}（Nは1から連番）
     - 商品画像URL → {{RANKING_N_IMAGE}}
     - 商品リンクURL → {{RANKING_N_URL}}
     - 商品説明文 → {{RANKING_N_DESCRIPTION}}
     - 商品バッジ/ラベル → {{RANKING_N_BADGE}}
   - ランキングセクションのタイトル → {{RANKING_TITLE}}
   - ランキングセクションの説明文 → {{RANKING_DESCRIPTION}}
   - メインCTAボタンのURL → {{CTA_URL}}
   - メインCTAボタンのテキスト → {{CTA_TEXT}}
3. ヘッダー画像部分は条件ブロックで囲んでください: <!--IF:HEADER_IMAGE-->...<!--ENDIF:HEADER_IMAGE-->
4. ランキングセクション全体も条件ブロックで囲んでください: <!--IF:RANKING_1_NAME-->...<!--ENDIF:RANKING_1_NAME-->
5. フッター部分（会社情報、SNSリンク、配信停止リンク等）はそのまま保持してください。

## レスポンス形式

以下のJSON形式で返してください。JSONのみを返し、他のテキストは含めないでください:

\`\`\`json
{
  "html_template": "（プレースホルダー付きHTML全体）",
  "product_count": （通常商品の数）,
  "ranking_count": （ランキング商品の数、なければ0）,
  "has_ranking": （ランキングセクションがあるかどうか true/false）,
  "description": "（このテンプレートの簡潔な説明、例: '2商品+4ランキングの丼ぶり特集レイアウト'）"
}
\`\`\`

## 入力HTML

${rawHtml}`

  const response = await generateText(prompt)

  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('AIからの応答をパースできませんでした')
  }

  const jsonStr = jsonMatch[1] || jsonMatch[0]
  const parsed = JSON.parse(jsonStr)

  return {
    html_template: parsed.html_template,
    product_count: parsed.product_count || 2,
    has_ranking: parsed.has_ranking || false,
    description: parsed.description || '',
  }
}

/**
 * AI提案の確認質問への回答 + テンプレート + 商品データから、最終HTMLを生成する
 */
export async function generateNewsletterWithAI(params: {
  templateHtml: string
  theme: string
  subject?: string
  directionMemo?: string
  answers: Record<string, string>
  products: Array<{
    product_name: string | null
    product_image_url: string | null
    s3_image_url: string | null
    product_url: string
    role: 'recommend' | 'ranking'
    position: number
  }>
  formFields?: {
    header?: { image_url: string } | null
    greeting?: string
    recommend?: { title: string; tags: string[] }
    subSection?: {
      type: 'ranking' | 'product_intro'
      title: string
      products: Array<{
        product_url: string
        product_name: string | null
        product_image_url: string | null
        s3_image_url: string | null
      }>
      tags: string[]
    } | null
    cta?: { text: string; url: string }
    feature?: { title: string; description: string }
    contentZone?: Array<{ image_url: string; link_url: string; text: string }>
  }
}): Promise<string> {
  const { templateHtml, theme, subject, directionMemo, answers, products, formFields } = params
  const newsletterSubject = subject || theme

  const recommendProducts = products
    .filter(p => p.role === 'recommend')
    .sort((a, b) => a.position - b.position)

  // ランキング商品: フォームのsub_sectionから取得（優先）、なければDBのroleから
  let rankingProducts: typeof products = []
  if (formFields?.subSection) {
    rankingProducts = formFields.subSection.products.map((p, i) => ({
      product_name: p.product_name,
      product_image_url: p.product_image_url,
      s3_image_url: p.s3_image_url,
      product_url: p.product_url,
      role: 'ranking' as const,
      position: i,
    }))
  } else {
    rankingProducts = products
      .filter(p => p.role === 'ranking')
      .sort((a, b) => a.position - b.position)
  }

  const productListText = recommendProducts.map((p, i) => {
    const img = p.s3_image_url || p.product_image_url || ''
    const tag = formFields?.recommend?.tags?.[i] || ''
    return `おすすめ商品${i + 1}: 名前="${p.product_name || '未設定'}", 画像URL="${img}", リンクURL="${p.product_url}"${tag ? `, バッジ="${tag}"` : ''}`
  }).join('\n')

  const isProductIntro = formFields?.subSection?.type === 'product_intro'

  // 商品紹介モードの場合、テンプレートHTMLからランキング順位バッジを除去する
  // テンプレートに「1」「2」等の順位バッジがハードコードされていると、
  // AIがそれに引きずられてランキング形式で出力してしまうため
  let processedTemplateHtml = templateHtml
  if (isProductIntro) {
    // ランキング順位バッジの<td>を除去（丸い番号バッジを含む<td>）
    // パターン: <td ...><span style="...border-radius:50%...">数字</span></td>
    processedTemplateHtml = processedTemplateHtml.replace(
      /<td[^>]*>\s*<span[^>]*border-radius:\s*50%[^>]*>\s*\d+\s*<\/span>\s*<\/td>/gi,
      ''
    )
    // HTMLコメントの「Ranking N」も「Item N」に置換
    processedTemplateHtml = processedTemplateHtml.replace(
      /<!--\s*Ranking\s+(\d+)\s*-->/gi,
      '<!-- Item $1 -->'
    )
    // 「Ranking Items」コメントも置換
    processedTemplateHtml = processedTemplateHtml.replace(
      /<!--\s*Ranking Items\s*-->/gi,
      '<!-- Product Items -->'
    )
  }

  const rankingListText = rankingProducts.map((p, i) => {
    const img = p.s3_image_url || p.product_image_url || ''
    const tag = formFields?.subSection?.tags?.[i] || ''
    const prefix = isProductIntro ? `商品紹介${i + 1}` : `ランキング${i + 1}位`
    return `${prefix}: 名前="${p.product_name || '未設定'}", 画像URL="${img}", リンクURL="${p.product_url}"${tag ? `, バッジ="${tag}"` : ''}`
  }).join('\n')

  // フォームフィールドの明示的な値を構築
  const formFieldsText: string[] = []
  if (formFields?.header) {
    formFieldsText.push(`ヘッダー画像: 使用する（URL: ${formFields.header.image_url}）`)
  } else {
    formFieldsText.push(`ヘッダー画像: 使用しない（ヘッダー画像セクションを削除すること）`)
  }
  if (formFields?.greeting) {
    formFieldsText.push(`挨拶文: ${formFields.greeting}`)
  }
  if (formFields?.recommend?.title) {
    formFieldsText.push(`おすすめタイトル: ${formFields.recommend.title}`)
  }
  if (formFields?.subSection) {
    formFieldsText.push(`${formFields.subSection.type === 'ranking' ? 'ランキング' : '商品紹介'}セクション: 使用する`)
    if (formFields.subSection.title) {
      formFieldsText.push(`ランキング/商品紹介タイトル: ${formFields.subSection.title}`)
    }
  } else {
    formFieldsText.push(`ランキング/商品紹介セクション: 使用しない（セクションを削除すること）`)
  }
  if (formFields?.cta?.text) {
    formFieldsText.push(`CTAボタンテキスト: ${formFields.cta.text}`)
  }
  if (formFields?.cta?.url) {
    formFieldsText.push(`CTAボタンURL: ${formFields.cta.url}`)
  }
  if (formFields?.feature?.title) {
    formFieldsText.push(`特集タイトル: ${formFields.feature.title}`)
  }
  if (formFields?.feature?.description) {
    formFieldsText.push(`特集説明: ${formFields.feature.description}`)
  }

  const answersText = Object.entries(answers)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n')

  const prompt = `あなたはメールマガジンの制作エキスパートです。
プロのコピーライターとして、テンプレートHTMLを元に完成されたメルマガHTMLを生成してください。

## テンプレートHTML

${processedTemplateHtml}

## 特集テーマ（管理名）
${theme}

## メルマガ件名
${newsletterSubject}

## 方向性・指示
${directionMemo || '特になし'}

## ユーザーがフォームで設定した内容（最優先で反映すること）
${formFieldsText.join('\n')}

## AIへの回答（参考情報）
${answersText || '（なし）'}

## 商品データ

${productListText || '（おすすめ商品なし）'}

${rankingListText || (isProductIntro ? '（商品紹介商品なし）' : '（ランキング商品なし）')}

## 生成ルール

**最重要: 「ユーザーがフォームで設定した内容」が最優先です。AIへの回答は参考情報としてのみ使ってください。**

1. テンプレートHTMLのプレースホルダー（{{VARIABLE_NAME}}形式）を適切な内容で置換してください。

2. **データから直接置換するもの:**
   - {{HEADER_IMAGE}} → フォーム設定でヘッダー画像を「使用する」場合のみURLを使用
   - {{PRODUCT_N_IMAGE}} → おすすめ商品N の画像URL
   - {{PRODUCT_N_URL}} → おすすめ商品N のリンクURL（すべてのaタグのhrefも含む）
   - {{PRODUCT_N_NAME}} → おすすめ商品N の名前
   - {{PRODUCT_N_BADGE}} → おすすめ商品N のバッジ（フォーム設定のタグを使用）
   - {{RANKING_N_IMAGE}} → ${isProductIntro ? '商品紹介' : 'ランキング'}N の画像URL
   - {{RANKING_N_URL}} → ${isProductIntro ? '商品紹介' : 'ランキング'}N のリンクURL（すべてのaタグのhrefも含む）
   - {{RANKING_N_NAME}} → ${isProductIntro ? '商品紹介' : 'ランキング'}N の名前
   - {{RANKING_N_BADGE}} → ${isProductIntro ? '商品紹介' : 'ランキング'}N のバッジ（フォーム設定のタグを使用）

3. **フォーム設定を反映するもの（最優先）:**
   - {{NEWSLETTER_TITLE}} → メルマガの件名「${newsletterSubject}」を使用（titleタグ、h1等のメイン見出しに使用）。これはメール全体の件名であり、おすすめセクションのタイトルではない。特集テーマ（管理名）とは別物。
   - {{GREETING_TEXT}} → フォーム設定の挨拶文を使用
   - {{FEATURE_TITLE}} → フォーム設定の特集タイトル（空なら省略）
   - {{FEATURE_DESCRIPTION}} → フォーム設定の特集説明（空なら省略）
   - {{CTA_URL}} → フォーム設定のCTAリンク先URL
   - {{CTA_TEXT}} → フォーム設定のCTAボタンテキスト
   - {{RANKING_TITLE}} → フォーム設定の${isProductIntro ? '商品紹介' : 'ランキング'}タイトル

   **重要: おすすめ商品セクションのタイトルにはフォーム設定の「おすすめタイトル」を使用してください。メルマガタイトル（件名）をおすすめセクションのタイトルに使わないでください。これらは別のものです。**

4. **AIが生成するもの:**
   - {{PRODUCT_N_DESCRIPTION}} → 商品名と特集テーマから適切な説明文（1-2文）
   - {{RANKING_N_DESCRIPTION}} → ${isProductIntro ? '商品紹介' : 'ランキング'}商品の説明文
   - {{RANKING_DESCRIPTION}} → ${isProductIntro ? '商品紹介' : 'ランキング'}セクションの説明文

5. **${isProductIntro ? '商品紹介モード' : 'ランキングモード'}について:**
${isProductIntro
  ? `   - このメルマガでは「商品紹介」モードが選択されています。ランキング（順位）形式ではなく、通常の商品紹介として表示してください。
   - 「1位」「2位」「3位」などの順位表記は絶対に使わないでください。
   - セクションタイトルにも「ランキング」という言葉は使わず、フォーム設定のタイトルを使用してください。
   - 商品説明文も順位を意識した表現（「堂々の1位」等）ではなく、商品の特長を紹介する形式にしてください。`
  : `   - このメルマガでは「ランキング」モードが選択されています。順位を明示して表示してください。`}

6. 条件ブロック <!--IF:VARIABLE-->...<!--ENDIF:VARIABLE-->:
   - **ヘッダー画像**: フォーム設定で「使用しない」→ <!--IF:HEADER_IMAGE-->ブロック全体を必ず削除
   - **ランキング/商品紹介**: フォーム設定で「使用しない」→ <!--IF:RANKING_1_NAME-->ブロック全体を必ず削除
   - それ以外: 値がある場合 → 内容を残しIF/ENDIFコメントを削除、値がない場合 → ブロック全体を削除

7. **フォーム設定で「使用しない」とされたセクション**: テンプレートに条件ブロックがない場合でも、該当セクションのHTML要素を完全に除去してください。

8. **特集タイトル・特集説明がフォームで空の場合**: ユーザーが何も入力していないので、AIが勝手に内容を生成しないでください。プレースホルダーを空にするか、セクションを削除してください。

9. 文章のトーン: 容器なびのBtoB向けメルマガとして丁寧だが親しみやすい文体

10. **出力はHTMLコードのみ**を返してください。\`\`\`html等のマークダウン記法は含めないでください。`

  const response = await generateText(prompt)

  let html = response.trim()
  if (html.startsWith('```html')) {
    html = html.replace(/^```html\s*/, '').replace(/\s*```$/, '')
  } else if (html.startsWith('```')) {
    html = html.replace(/^```\s*/, '').replace(/\s*```$/, '')
  }

  return html
}
