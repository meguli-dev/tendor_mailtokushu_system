// Database entity types for Supabase (UUID PKs, timestamptz)

export type NewsletterStatus = 'draft' | 'exported' | 'sent'
export type FeaturePageStatus = 'draft' | 'published'
export type FeatureTemplateType = 'new_product' | 'category' | 'simple'
export type ImageType = 'product' | 'banner' | 'header' | 'other'
export type BannerMethod = 'gemini' | 'genspark_prompt' | 'manus' | 'manual'
export type BannerStatus = 'pending' | 'generated' | 'approved' | 'rejected'

export interface NewsletterDraftData {
  proposal?: {
    proposal_summary: string
    sections: Array<{
      section_id: string
      section_name: string
      section_type: string
      description: string
      questions: Array<{
        question_id: string
        question: string
        input_type: string
        options?: string[]
        default_value?: string
        required?: boolean
        placeholder?: string
      }>
    }>
    product_assignment?: {
      recommend_products: number[]
      ranking_products: number[]
      description: string
    }
  }
  answers?: Record<string, string>
  formFields?: {
    subject?: string
    useHeader?: boolean
    headerImageUrl?: string
    greeting?: string
    recommendTitle?: string
    recommendTags?: string[]
    useSubSection?: boolean
    sectionType?: string
    subSectionTitle?: string
    subSectionTags?: string[]
    ctaButtonText?: string
    ctaButtonUrl?: string
    featureTitle?: string
    featureDescription?: string
    directionMemo?: string
  }
  contentZone?: Array<{ id: string; image_url: string; link_url: string; text: string }>
}

export interface Newsletter {
  id: string
  user_id: string
  title: string
  template_id: string | null
  has_header_image: boolean
  header_image_url: string | null
  feature_title: string | null
  feature_description: string | null
  html_output: string | null
  draft_data: NewsletterDraftData | null
  status: NewsletterStatus
  created_at: string
  updated_at: string
}

export interface NewsletterProduct {
  id: string
  newsletter_id: string
  sort_order: number
  product_url: string
  product_name: string | null
  product_image_url: string | null
  s3_image_url: string | null
  is_ranking: boolean
  rank_position: number | null
  created_at: string
  updated_at: string
}

export interface NewsletterTemplate {
  id: string
  name: string
  description: string
  product_count: number
  has_ranking: boolean
  html_template: string
  thumbnail_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface FeaturePageDraftData {
  formFields?: {
    heroImageUrl?: string
    introText?: string
    appealText?: string
    directionMemo?: string
    ctaUrl?: string
    ctaText?: string
    // Template A: 新商品紹介型
    badgeText?: string
    problemSectionTitle?: string
    problemBefore?: string[]
    problemAfter?: string[]
    solutionText?: string
    mainFeatures?: Array<{ title: string; description: string }>
    subFeatures?: string[]
    useCases?: Array<{ title: string; description: string }>
    sizeGuide?: Array<{ label: string; specs: string; description: string }>
    faqItems?: Array<{ question: string; answer: string }>
    // Template B: カテゴリ特集型
    selectionGuideText?: string
    // Product categories for Template A
    productCategories?: Array<{
      title: string
      productIndices: number[]
    }>
  }
  aiGenerated?: boolean
}

export interface FeaturePage {
  id: string
  user_id: string
  title: string
  template_id: string | null
  template_type: FeatureTemplateType | null
  theme_color: string | null
  header_image_url: string | null
  html_output: string | null
  draft_data: FeaturePageDraftData | null
  status: FeaturePageStatus
  created_at: string
  updated_at: string
}

export interface FeatureTemplate {
  id: string
  name: string
  html_template: string
  thumbnail_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface FeatureProduct {
  id: string
  feature_page_id: string
  sort_order: number
  product_url: string
  product_name: string | null
  s3_image_url: string | null
  description: string | null
  created_at: string
  updated_at: string
}

export interface AppImage {
  id: string
  user_id: string
  s3_key: string
  s3_url: string
  original_url: string | null
  image_type: ImageType
  file_name: string
  file_size: number | null
  width: number | null
  height: number | null
  created_at: string
}

export interface BannerGenerationLog {
  id: string
  user_id: string
  newsletter_id: string | null
  feature_page_id: string | null
  method: BannerMethod
  prompt: string | null
  input_params: Record<string, unknown> | null
  result_image_url: string | null
  status: BannerStatus
  created_at: string
}

// Extended types with relations
export interface NewsletterWithProducts extends Newsletter {
  products: NewsletterProduct[]
  template: NewsletterTemplate | null
}

export interface FeaturePageWithProducts extends FeaturePage {
  products: FeatureProduct[]
  template: FeatureTemplate | null
}

// Auth types
export interface User {
  id: string
  email: string
  name?: string
}

export interface AuthResult {
  user: User
  error?: string
}

// API response types
export interface ScrapeResult {
  product_name: string
  original_image_url: string
  s3_image_url?: string
}

export interface GenSparkPromptResult {
  prompt: string
  reference_images: string[]
  product_images: string[]
}
