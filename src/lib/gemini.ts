import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

// 画像生成モデル（コスト: Pro=$0.134/枚, 3.1 Flash=$0.067/枚, 2.5 Flash=$0.039/枚）
const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image-preview'

export interface BannerTonmanaParams {
  design_style?: string
  color_primary?: string
  color_accent?: string
  color_background?: string
  font_style?: string
  atmosphere?: string
  ng_elements?: string
  reference_image_url?: string | null
  additional_instructions?: string
}

export async function generateBannerImage(params: {
  mainText?: string
  newsletterTitle: string
  subText?: string
  width: number
  height: number
  productImages?: string[]
  referenceImageUrl?: string
  pageContext?: string
  imageModel?: string
  tonmana?: BannerTonmanaParams | null
}): Promise<{ imageData: string; mimeType: string }> {
  const model = genAI.getGenerativeModel({
    model: params.imageModel || DEFAULT_IMAGE_MODEL,
    generationConfig: {
      // @ts-expect-error -- responseModalities is supported in v0.24+ but not yet in types
      responseModalities: ['TEXT', 'IMAGE'],
    },
  })

  const prompt = buildBannerPrompt(params)

  // Build content parts: prompt + reference image + product images
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: prompt },
  ]

  // Add tonmana reference image if set
  if (params.tonmana?.reference_image_url) {
    try {
      const tonmanaRefPart = await fetchImageAsPart(params.tonmana.reference_image_url)
      parts.push(tonmanaRefPart)
      parts.push({ text: '上記はブランドのトンマナ参考画像です。デザインの雰囲気・色使い・レイアウト感を参考にしてください。テキスト・文字・ロゴはコピーしないでください。' })
    } catch {
      // Tonmana reference image fetch failed, continue without it
    }
  }

  // Add reference image if provided (per-generation)
  if (params.referenceImageUrl) {
    try {
      const refPart = await fetchImageAsPart(params.referenceImageUrl)
      parts.push(refPart)
      parts.push({ text: '上記は参考画像です。レイアウトや色使いの雰囲気のみ参考にしてください。参考画像に含まれるテキスト・文字・ロゴは一切コピーしないでください。' })
    } catch {
      // Reference image fetch failed, continue without it
    }
  }

  // Add product images
  if (params.productImages?.length) {
    for (const url of params.productImages.slice(0, 4)) {
      try {
        const imgPart = await fetchImageAsPart(url)
        parts.push(imgPart)
      } catch {
        // Skip failed product images
      }
    }
    if (params.productImages.length > 0) {
      parts.push({ text: '上記は商品画像です。各商品画像の背景を完全に削除（透過切り抜き）してから、バナーに配置してください。商品本体のみを使用し、元の背景は一切残さないでください。' })
    }
  }

  const result = await model.generateContent(parts)
  const response = result.response

  // Find image part in response
  const candidates = response.candidates
  if (candidates && candidates.length > 0) {
    for (const part of candidates[0].content.parts) {
      if (part.inlineData) {
        return {
          imageData: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        }
      }
    }
  }

  throw new Error('Geminiから画像が生成されませんでした。プロンプトを調整して再試行してください。')
}

async function fetchImageAsPart(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch: ${url}`)
  const buffer = await response.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const mimeType = response.headers.get('content-type') || 'image/jpeg'
  return {
    inlineData: {
      data: base64,
      mimeType,
    },
  }
}

function buildBannerPrompt(params: {
  mainText?: string
  newsletterTitle: string
  subText?: string
  width: number
  height: number
  pageContext?: string
  tonmana?: BannerTonmanaParams | null
}): string {
  const hasMainText = params.mainText && params.mainText.trim()
  const t = params.tonmana

  // トンマナ設定からデザイン指示を構築
  const tonmanaBlock = buildTonmanaBlock(t)

  if (hasMainText) {
    return `あなたはプロのグラフィックデザイナーです。以下の条件でメルマガ用バナー画像を1枚生成してください。

【サイズ】${params.width} x ${params.height}px
【バナーに表示するテキスト】${params.mainText}
${params.pageContext ? `【コンテキスト】${params.pageContext}` : ''}

【デザイン要件】
- 日本語テキストは大きく読みやすく配置
- メインテキストが最も目立つように
- 商品画像が提供されている場合は、背景を完全に除去して商品本体のみを切り抜いてから配置
- プロフェッショナルで洗練された印象
- 商品の型番（英数字の品番コード）はバナーに含めないこと
${tonmanaBlock}

【テキストに関する厳守事項】
- バナーに含めるテキストは上記で指定したもの「だけ」にすること
- 指定されていないテキスト、キャッチコピー、説明文は一切追加しないこと
- 参考画像に含まれる文字を読み取ってコピー・模倣しないこと
- シンプルで文字の少ないバナーを目指すこと

画像のみを生成してください。`
  }

  return `あなたはプロのグラフィックデザイナーです。以下の条件でメルマガ用バナー画像を1枚生成してください。

【サイズ】${params.width} x ${params.height}px
【メルマガタイトル】${params.newsletterTitle}
${params.pageContext ? `【コンテキスト】${params.pageContext}` : ''}

【テキスト生成の指示】
上記のメルマガタイトルを元に、バナー画像に映えるキャッチーで短いテキストを1つだけ考えて配置してください。
タイトルをそのまま使うのではなく、バナー向けに簡潔で目を引く表現にアレンジしてください。

【デザイン要件】
- 日本語テキストは大きく読みやすく配置
- メインテキストが最も目立つように
- 商品画像が提供されている場合は、背景を完全に除去して商品本体のみを切り抜いてから配置
- プロフェッショナルで洗練された印象
- 商品の型番（英数字の品番コード）はバナーに含めないこと
${tonmanaBlock}

【テキストに関する厳守事項】
- バナーに含めるテキストは生成した1つのキャッチコピーのみにすること
- それ以外の説明文、サブテキスト、補足文言は一切追加しないこと
- 参考画像に含まれる文字を読み取ってコピー・模倣しないこと
- シンプルで文字の少ないバナーを目指すこと

画像のみを生成してください。`
}

const DESIGN_STYLE_MAP: Record<string, string> = {
  clean: '清潔感・信頼感のあるクリーンなデザイン',
  natural: '自然素材感・オーガニックな印象のナチュラルデザイン',
  pop: '明るく楽しいポップなデザイン',
  elegant: '高級感・上品さのあるエレガントなデザイン',
  minimal: 'シンプルで洗練されたミニマルデザイン',
  warm: '温かみのある親しみやすいデザイン',
  cool: 'モダンでスタイリッシュなクールデザイン',
}

const FONT_STYLE_MAP: Record<string, string> = {
  bold_readable: '太めのゴシック体で視認性を重視',
  elegant_serif: '品格のある明朝体ベースの上品な文字',
  casual_round: '柔らかく親しみやすい丸ゴシック系の文字',
  modern_sans: 'すっきりとした現代的なサンセリフ系の文字',
  handwritten: '温かみのある手書き風テイストの文字',
}

const BG_STYLE_MAP: Record<string, string> = {
  warm: '暖色系（オレンジ・ベージュ・ブラウン等）',
  cool: '寒色系（ブルー・グレー等）',
  neutral: 'ニュートラル（白・グレー・ベージュ等）',
  pastel: 'パステルカラー（柔らかく淡い色合い）',
  vivid: 'ビビッドカラー（鮮やかで目を引く色合い）',
}

function buildTonmanaBlock(t?: BannerTonmanaParams | null): string {
  if (!t) {
    // デフォルト（トンマナ未設定時）
    return `- 食品容器・テイクアウト向けの清潔感のあるデザイン
- 背景はテーマに合った色使い（暖色系推奨）`
  }

  const lines: string[] = []

  lines.push(`\n【トンマナ（ブランドデザインルール）】`)
  lines.push(`- デザインスタイル: ${DESIGN_STYLE_MAP[t.design_style || 'clean'] || t.design_style}`)
  lines.push(`- メインカラー: ${t.color_primary || '#e8690a'}（タイトルや強調部分に使用）`)
  lines.push(`- アクセントカラー: ${t.color_accent || '#2563eb'}（ボタンやアクセント要素に使用）`)
  lines.push(`- 背景の色味: ${BG_STYLE_MAP[t.color_background || 'warm'] || t.color_background}`)
  lines.push(`- フォントスタイル: ${FONT_STYLE_MAP[t.font_style || 'bold_readable'] || t.font_style}`)

  if (t.atmosphere) {
    lines.push(`- 雰囲気: ${t.atmosphere}`)
  }
  if (t.ng_elements) {
    lines.push(`- 【NG要素・避けること】: ${t.ng_elements}`)
  }
  if (t.additional_instructions) {
    lines.push(`- 【追加ルール】: ${t.additional_instructions}`)
  }

  return lines.join('\n')
}

export async function editBannerImage(params: {
  baseImageUrl: string
  editInstruction: string
  imageModel?: string
}): Promise<{ imageData: string; mimeType: string }> {
  const model = genAI.getGenerativeModel({
    model: params.imageModel || DEFAULT_IMAGE_MODEL,
    generationConfig: {
      // @ts-expect-error -- responseModalities is supported in v0.24+ but not yet in types
      responseModalities: ['TEXT', 'IMAGE'],
    },
  })

  // Fetch the base image
  const basePart = await fetchImageAsPart(params.baseImageUrl)

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: `以下の画像を編集してください。元の画像のデザイン・レイアウト・色合いを忠実に保持したまま、指定された修正点のみを変更してください。

【修正指示】
${params.editInstruction}

【重要】
- 元画像の構図やスタイルは維持すること
- 指示された箇所以外は変更しないこと
- 画像のみを出力すること` },
    basePart,
  ]

  const result = await model.generateContent(parts)
  const response = result.response

  const candidates = response.candidates
  if (candidates && candidates.length > 0) {
    for (const part of candidates[0].content.parts) {
      if (part.inlineData) {
        return {
          imageData: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        }
      }
    }
  }

  throw new Error('画像の編集に失敗しました。修正指示を変えて再試行してください。')
}

export async function generateText(prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await model.generateContent(prompt)
  return result.response.text()
}
