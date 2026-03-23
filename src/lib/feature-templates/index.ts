import type { FeatureTemplateType } from '@/types'

export { getTemplateA, mainFeatureCard, subFeatureCard, useCaseCard, productCard, sizeGuideCard, faqItem, categoryTitle } from './template-a-new-product'
export { getTemplateB, recommendProductCard, gridProductCard } from './template-b-category'
export { getTemplateC, simpleProductCard } from './template-c-simple'

/** テンプレート定義 */
export const FEATURE_TEMPLATE_DEFS: Array<{
  type: FeatureTemplateType
  name: string
  description: string
  sections: string[]
}> = [
  {
    type: 'new_product',
    name: '新商品紹介型',
    description: '新商品の課題提起から特長、ラインナップまで詳しく紹介するテンプレート',
    sections: ['ヒーロー', '課題提起', '特長', 'ラインナップ', '利用シーン', '選び方', 'FAQ', 'CTA'],
  },
  {
    type: 'category',
    name: 'カテゴリ特集型',
    description: '既存商品をカテゴリでまとめて紹介するテンプレート',
    sections: ['ヒーロー', '導入文', 'おすすめ', '商品一覧', '選び方ガイド', 'CTA'],
  },
  {
    type: 'simple',
    name: 'シンプル訴求型',
    description: '季節特集やキャンペーン向けのシンプルなテンプレート',
    sections: ['ヒーロー', '訴求テキスト', '商品一覧', 'CTA'],
  },
]

/** テーマカラーから派生色を計算 */
export function computeThemeColors(hex: string): {
  themeColor: string
  themeColorLight: string
  themeColorDark: string
} {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  // ライト: 背景用の薄い色
  const lr = Math.min(255, Math.round(r + (255 - r) * 0.9))
  const lg = Math.min(255, Math.round(g + (255 - g) * 0.9))
  const lb = Math.min(255, Math.round(b + (255 - b) * 0.9))

  // ダーク: ボーダー・アクセント用
  const dr = Math.max(0, Math.round(r * 0.75))
  const dg = Math.max(0, Math.round(g * 0.75))
  const db = Math.max(0, Math.round(b * 0.75))

  const toHex = (n: number) => n.toString(16).padStart(2, '0')

  return {
    themeColor: hex,
    themeColorLight: `#${toHex(lr)}${toHex(lg)}${toHex(lb)}`,
    themeColorDark: `#${toHex(dr)}${toHex(dg)}${toHex(db)}`,
  }
}

/** プリセットカラー */
export const PRESET_COLORS = [
  { label: 'オレンジ', hex: '#e8690a' },
  { label: 'ブルー', hex: '#2563eb' },
  { label: 'グリーン', hex: '#16a34a' },
  { label: 'レッド', hex: '#dc2626' },
  { label: 'パープル', hex: '#9333ea' },
  { label: 'ピンク', hex: '#db2777' },
  { label: 'ティール', hex: '#0d9488' },
  { label: 'ブラウン', hex: '#92400e' },
]
