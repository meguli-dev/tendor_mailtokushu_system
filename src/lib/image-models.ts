/**
 * 画像生成モデルの定義（単一ソース）
 * UI・バリデーション・API・使用量カウントはすべてここを参照する
 */
export const IMAGE_MODELS = [
  {
    id: 'gpt-image-2.5-sunburst',
    label: 'GPT Image 2.5 Sunburst（OpenAI・推奨）',
    provider: 'openai',
    units: 1, // 1回の生成で消費する枚数
  },
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2（OpenAI・旧）',
    provider: 'openai',
    units: 1,
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    label: 'Gemini 3.1 Flash（通常）',
    provider: 'gemini',
    units: 1,
  },
  {
    id: 'gemini-3-pro-image-preview',
    label: 'Gemini 3 Pro（高品質）',
    provider: 'gemini',
    units: 2,
  },
] as const

export type ImageModelId = (typeof IMAGE_MODELS)[number]['id']
export type ImageProvider = (typeof IMAGE_MODELS)[number]['provider']

export const IMAGE_MODEL_IDS = IMAGE_MODELS.map(m => m.id) as [ImageModelId, ...ImageModelId[]]
export const DEFAULT_IMAGE_MODEL: ImageModelId = 'gpt-image-2.5-sunburst'

/** OpenAIの生成品質（low / medium / high）。コストと速度を優先して low */
export const OPENAI_IMAGE_QUALITY = 'low'

export function imageModelDef(id: string) {
  return IMAGE_MODELS.find(m => m.id === id) ?? IMAGE_MODELS.find(m => m.id === DEFAULT_IMAGE_MODEL)!
}
