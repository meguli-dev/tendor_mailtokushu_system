export const APP_NAME = '容器なび メルマガビルダー'
export const APP_DESCRIPTION = 'メルマガ・特集ページHTML生成ツール'

export const YOKINAVI_BASE_URL = 'https://yo-ki-navi.com'

export const S3_PATHS = {
  products: 'products',
  banners: 'banners',
  headers: 'headers',
  uploads: 'uploads',
} as const

export const SCRAPE_SELECTORS = {
  mainImage: '.__primary .__main img[src]',
  productTitle: 'h1.__title',
} as const

export const SCRAPE_TIMEOUT_MS = 5000

export const TEMPLATE_VARIABLES = [
  '{{HEADER_IMAGE}}',
  '{{NEWSLETTER_TITLE}}',
  '{{GREETING_TEXT}}',
  '{{FEATURE_TITLE}}',
  '{{FEATURE_DESCRIPTION}}',
  '{{CTA_URL}}',
  '{{CTA_TEXT}}',
  '{{PRODUCT_1_NAME}}',
  '{{PRODUCT_1_IMAGE}}',
  '{{PRODUCT_1_URL}}',
  '{{PRODUCT_1_DESCRIPTION}}',
  '{{PRODUCT_1_BADGE}}',
  '{{PRODUCT_2_NAME}}',
  '{{PRODUCT_2_IMAGE}}',
  '{{PRODUCT_2_URL}}',
  '{{PRODUCT_2_DESCRIPTION}}',
  '{{PRODUCT_2_BADGE}}',
  '{{PRODUCT_3_NAME}}',
  '{{PRODUCT_3_IMAGE}}',
  '{{PRODUCT_3_URL}}',
  '{{PRODUCT_3_DESCRIPTION}}',
  '{{PRODUCT_3_BADGE}}',
  '{{PRODUCT_4_NAME}}',
  '{{PRODUCT_4_IMAGE}}',
  '{{PRODUCT_4_URL}}',
  '{{PRODUCT_4_DESCRIPTION}}',
  '{{PRODUCT_4_BADGE}}',
  '{{RANKING_TITLE}}',
  '{{RANKING_DESCRIPTION}}',
  '{{RANKING_1_NAME}}',
  '{{RANKING_1_IMAGE}}',
  '{{RANKING_1_URL}}',
  '{{RANKING_1_DESCRIPTION}}',
  '{{RANKING_1_BADGE}}',
  '{{RANKING_2_NAME}}',
  '{{RANKING_2_IMAGE}}',
  '{{RANKING_2_URL}}',
  '{{RANKING_2_DESCRIPTION}}',
  '{{RANKING_2_BADGE}}',
  '{{RANKING_3_NAME}}',
  '{{RANKING_3_IMAGE}}',
  '{{RANKING_3_URL}}',
  '{{RANKING_3_DESCRIPTION}}',
  '{{RANKING_3_BADGE}}',
  '{{RANKING_4_NAME}}',
  '{{RANKING_4_IMAGE}}',
  '{{RANKING_4_URL}}',
  '{{RANKING_4_DESCRIPTION}}',
  '{{RANKING_4_BADGE}}',
] as const

export const NEWSLETTER_STATUSES = {
  draft: { label: '下書き', variant: 'secondary' as const },
  exported: { label: 'エクスポート済', variant: 'default' as const },
  sent: { label: '配信済', variant: 'outline' as const },
} as const

export const FEATURE_PAGE_STATUSES = {
  draft: { label: '下書き', variant: 'secondary' as const },
  published: { label: '公開済', variant: 'default' as const },
} as const
