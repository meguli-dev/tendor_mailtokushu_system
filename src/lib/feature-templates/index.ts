import type { FeatureTemplateType } from '@/types'

export { getTemplateA, mainFeatureCard, subFeatureCard, useCaseCard, productCard, sizeGuideCard, faqItem, categoryTitle } from './template-a-new-product'
export { getTemplateB, recommendProductCard, gridProductCard, selectionGuideCard, categoryUseCaseCard, categoryFaqItem } from './template-b-category'
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
    sections: ['ヒーロー', '導入文', 'おすすめ', '商品一覧', '選び方ガイド', '利用シーン', 'FAQ', 'CTA'],
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

/** おすすめ商品セクションHTML */
export function pickupProductCard(
  name: string,
  imageUrl: string,
  linkUrl: string,
  description: string,
  badge: string,
  themeColor: string
): string {
  const badgeHtml = badge
    ? `<span style="position:absolute;top:8px;left:8px;background:${themeColor};color:#fff;font-size:11px;font-weight:bold;padding:2px 10px;border-radius:12px;">${badge}</span>`
    : ''
  return `<div style="width:calc(50% - 12px);min-width:200px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;box-sizing:border-box;">
  <a href="${linkUrl}" style="text-decoration:none;color:inherit;display:block;">
    <div style="position:relative;aspect-ratio:1;background:#f9fafb;display:flex;align-items:center;justify-content:center;overflow:hidden;">
      ${imageUrl ? `<img src="${imageUrl}" alt="${name}" style="width:100%;height:100%;object-fit:contain;">` : ''}
      ${badgeHtml}
    </div>
    <div style="padding:12px 14px;">
      <p style="font-size:14px;font-weight:bold;margin:0 0 6px;line-height:1.4;">${name}</p>
      <p style="font-size:12px;color:#6b7280;margin:0;line-height:1.6;">${description}</p>
    </div>
  </a>
</div>`
}

export function pickupSectionHtml(
  title: string,
  products: Array<{ product_name: string; product_image_url: string; product_url: string; description: string; badge: string }>,
  themeColor: string
): string {
  if (products.length === 0) return ''
  const cards = products
    .map(p => pickupProductCard(p.product_name, p.product_image_url, p.product_url, p.description, p.badge, themeColor))
    .join('\n')
  return `
<!-- おすすめ商品セクション -->
<div style="margin:48px 0;">
  <h2 style="text-align:center;font-size:20px;font-weight:bold;margin-bottom:24px;padding-bottom:12px;border-bottom:3px solid ${themeColor};">${title}</h2>
  <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;">
    ${cards}
  </div>
</div>`
}

/** コンテンツゾーンHTML */
export function contentZoneBlockHtml(
  imageUrl: string,
  linkUrl: string,
  comment: string
): string {
  const imgTag = imageUrl
    ? `<img src="${imageUrl}" alt="" style="width:100%;border-radius:8px;display:block;">`
    : ''
  const wrapped = linkUrl
    ? `<a href="${linkUrl}" style="display:block;text-decoration:none;">${imgTag}</a>`
    : imgTag
  const commentHtml = comment
    ? `<p style="font-size:13px;color:#6b7280;margin:8px 0 0;line-height:1.6;">${comment}</p>`
    : ''
  return `<div style="margin-bottom:20px;">
  ${wrapped}
  ${commentHtml}
</div>`
}

export function contentZoneSectionHtml(
  blocks: Array<{ image_url: string; link_url: string; comment: string }>
): string {
  if (blocks.length === 0) return ''
  const blocksHtml = blocks
    .map(b => contentZoneBlockHtml(b.image_url, b.link_url, b.comment))
    .join('\n')
  return `
<!-- コンテンツゾーン -->
<div style="margin:48px 0;">
  ${blocksHtml}
</div>`
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
