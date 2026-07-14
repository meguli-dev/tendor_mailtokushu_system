/**
 * OpenAI gpt-image 系による画像生成・編集
 * gemini.ts と同じインターフェース（generateBannerImage / editBannerImage）を提供する
 */
import type { BannerTonmanaParams } from './gemini'
import { buildBannerPrompt } from './gemini'

const OPENAI_API = 'https://api.openai.com/v1'

/** 要求サイズをgpt-imageの対応サイズにスナップする（縦横比で判定） */
function snapSize(width: number, height: number): string {
  const ratio = width / height
  if (ratio > 1.2) return '1536x1024'
  if (ratio < 0.8) return '1024x1536'
  return '1024x1024'
}

async function fetchImageAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`)
  const buf = await res.arrayBuffer()
  return new Blob([buf], { type: res.headers.get('content-type') || 'image/png' })
}

function extractB64(json: unknown): { imageData: string; mimeType: string } {
  const data = (json as { data?: Array<{ b64_json?: string }> })?.data
  const b64 = data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAIから画像が生成されませんでした。プロンプトを調整して再試行してください。')
  return { imageData: b64, mimeType: 'image/png' }
}

async function openaiJson(path: string, body: FormData | string): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY || ''}`,
  }
  if (typeof body === 'string') headers['Content-Type'] = 'application/json'
  const res = await fetch(`${OPENAI_API}${path}`, { method: 'POST', headers, body })
  if (!res.ok) {
    const text = await res.text()
    let msg = text
    try { msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message || text } catch { /* raw text */ }
    throw new Error(`OpenAI画像生成エラー: ${msg}`)
  }
  return res.json()
}

export async function generateBannerImageOpenAI(params: {
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
  const model = params.imageModel || 'gpt-image-2'
  const size = snapSize(params.width, params.height)
  let prompt = buildBannerPrompt(params)

  // 入力画像（商品画像・参考画像）がある場合は edits エンドポイントで合成
  const inputUrls: Array<{ url: string; note: string }> = []
  if (params.tonmana?.reference_image_url) {
    inputUrls.push({ url: params.tonmana.reference_image_url, note: 'ブランドのトンマナ参考画像（雰囲気・色使いのみ参考。テキスト・ロゴはコピーしない）' })
  }
  if (params.referenceImageUrl) {
    inputUrls.push({ url: params.referenceImageUrl, note: '参考画像（レイアウトと色使いの雰囲気のみ参考。含まれる文字は一切コピーしない）' })
  }
  for (const url of (params.productImages || []).slice(0, 4)) {
    inputUrls.push({ url, note: '商品画像（背景を完全に除去して商品本体のみをバナーに配置する）' })
  }

  if (inputUrls.length === 0) {
    const json = await openaiJson('/images/generations', JSON.stringify({ model, prompt, size, n: 1 }))
    return extractB64(json)
  }

  prompt += '\n\n【添付画像の扱い】\n' + inputUrls.map((u, i) => `画像${i + 1}: ${u.note}`).join('\n')
  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('size', size)
  let ok = 0
  for (const [i, u] of inputUrls.entries()) {
    try {
      form.append('image[]', await fetchImageAsBlob(u.url), `input-${i + 1}.png`)
      ok++
    } catch {
      // 取得できない入力画像はスキップ（プロンプト記述とズレるが生成は継続）
    }
  }
  if (ok === 0) {
    const json = await openaiJson('/images/generations', JSON.stringify({ model, prompt, size, n: 1 }))
    return extractB64(json)
  }
  return extractB64(await openaiJson('/images/edits', form))
}

export async function editBannerImageOpenAI(params: {
  baseImageUrl: string
  editInstruction: string
  imageModel?: string
}): Promise<{ imageData: string; mimeType: string }> {
  const model = params.imageModel || 'gpt-image-2'
  const form = new FormData()
  form.append('model', model)
  form.append('prompt', `以下の画像を編集してください。元の画像のデザイン・レイアウト・色合いを忠実に保持したまま、指定された修正点のみを変更してください。

【修正指示】
${params.editInstruction}

【重要】
- 元画像の構図やスタイルは維持すること
- 指示された箇所以外は変更しないこと`)
  form.append('image[]', await fetchImageAsBlob(params.baseImageUrl), 'base.png')
  return extractB64(await openaiJson('/images/edits', form))
}
