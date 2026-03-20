import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function generateBannerImage(params: {
  mainText: string
  subText?: string
  width: number
  height: number
  productImages?: string[]
  referenceImageUrl?: string
  pageContext?: string
}): Promise<{ imageData: string; mimeType: string }> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
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

  // Add reference image if provided
  if (params.referenceImageUrl) {
    try {
      const refPart = await fetchImageAsPart(params.referenceImageUrl)
      parts.push(refPart)
      parts.push({ text: '上記は参考画像です。このスタイル・雰囲気を参考にしてバナーを生成してください。' })
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
      parts.push({ text: '上記は商品画像です。バナーに配置してください。' })
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
  mainText: string
  subText?: string
  width: number
  height: number
  pageContext?: string
}): string {
  return `あなたはプロのグラフィックデザイナーです。以下の条件でメルマガ用バナー画像を1枚生成してください。

【サイズ】${params.width} x ${params.height}px
【メインテキスト】${params.mainText}
${params.subText ? `【サブテキスト】${params.subText}` : ''}
${params.pageContext ? `【コンテキスト】${params.pageContext}` : ''}

【デザイン要件】
- 日本語テキストは大きく読みやすく配置
- 食品容器・テイクアウト向けの清潔感のあるデザイン
- メインテキストが最も目立つように
- 商品画像が提供されている場合は、バランスよく配置
- 背景はテーマに合った色使い（暖色系推奨）
- プロフェッショナルで洗練された印象

画像のみを生成してください。`
}

export async function generateText(prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await model.generateContent(prompt)
  return result.response.text()
}
