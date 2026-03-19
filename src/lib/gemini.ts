import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function generateBannerImage(params: {
  templatePattern: string
  productImages: string[]
  mainText: string
  subText?: string
  width: number
  height: number
  pageContext?: string
}): Promise<{ imageData: string; mimeType: string }> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = buildImagePrompt(params)

  // Fetch product images and convert to parts
  const imageParts = await Promise.all(
    params.productImages.map(async (url) => {
      const response = await fetch(url)
      const buffer = await response.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const mimeType = response.headers.get('content-type') || 'image/jpeg'
      return {
        inlineData: {
          data: base64,
          mimeType,
        },
      }
    })
  )

  const result = await model.generateContent([prompt, ...imageParts])
  const response = result.response
  const text = response.text()

  // For now, return text response - actual image generation via Imagen
  // would use a different endpoint
  return {
    imageData: text,
    mimeType: 'text/plain',
  }
}

function buildImagePrompt(params: {
  templatePattern: string
  mainText: string
  subText?: string
  width: number
  height: number
  pageContext?: string
}): string {
  return `バナー画像を作成するための指示:

サイズ: ${params.width}x${params.height}px
レイアウトパターン: ${params.templatePattern}

メインテキスト: ${params.mainText}
${params.subText ? `サブテキスト: ${params.subText}` : ''}
${params.pageContext ? `\nコンテキスト: ${params.pageContext}` : ''}

添付された商品画像を使用して、プロフェッショナルなバナー画像を生成してください。
日本語テキストは読みやすく配置してください。
背景は商品カテゴリに合ったデザインにしてください。`
}

export async function generateText(prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await model.generateContent(prompt)
  return result.response.text()
}
