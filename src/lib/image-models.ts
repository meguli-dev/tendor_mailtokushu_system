/**
 * 画像生成モデルの定義（単一ソース）
 * UI・バリデーション・API・使用量カウントはすべてここを参照する
 */
// 2026-11-05: 生成は gpt-image-2.5-sunburst に一本化（Geminiでの生成は停止）
export const IMAGE_MODELS = [
  {
    id: 'gpt-image-2.5-sunburst',
    label: 'GPT Image 2.5 Sunburst（OpenAI）',
    provider: 'openai',
    units: 1, // 1回の生成で消費する枚数
  },
] as const

export type ImageModelId = (typeof IMAGE_MODELS)[number]['id']
export type ImageProvider = (typeof IMAGE_MODELS)[number]['provider']

const DEFAULT_IMAGE_MODEL_ID = 'gpt-image-2.5-sunburst'

/** 以前選べたモデル。画面に保存されていた値で送られてきても弾かず、既定モデルで生成する */
const LEGACY_IMAGE_MODEL_IDS = ['gpt-image-2', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'] as const

export const IMAGE_MODEL_IDS: [string, ...string[]] = [DEFAULT_IMAGE_MODEL_ID, ...LEGACY_IMAGE_MODEL_IDS]
export const DEFAULT_IMAGE_MODEL: ImageModelId = DEFAULT_IMAGE_MODEL_ID

/** OpenAIの生成品質（low / medium / high）。コストと速度を優先して low */
export const OPENAI_IMAGE_QUALITY = 'low'

export function imageModelDef(id: string) {
  return IMAGE_MODELS.find(m => m.id === id) ?? IMAGE_MODELS.find(m => m.id === DEFAULT_IMAGE_MODEL)!
}
