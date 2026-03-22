import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  password: z.string().min(6, 'パスワードは6文字以上で入力してください'),
})

export const newsletterSchema = z.object({
  title: z.string().min(1, 'タイトルを入力してください').max(255),
  template_id: z.string().uuid().nullable(),
  has_header_image: z.boolean().default(false),
  header_image_url: z.string().url().nullable().optional(),
  feature_title: z.string().max(255).nullable().optional(),
  feature_description: z.string().nullable().optional(),
  html_output: z.string().nullable().optional(),
  draft_data: z.any().nullable().optional(),
  status: z.enum(['draft', 'exported', 'sent']).default('draft'),
})

export const newsletterProductSchema = z.object({
  product_url: z.string().url('有効なURLを入力してください'),
  product_name: z.string().nullable().optional(),
  product_image_url: z.string().url().nullable().optional(),
  s3_image_url: z.string().url().nullable().optional(),
  sort_order: z.number().int().min(0),
  is_ranking: z.boolean().default(false),
  rank_position: z.number().int().nullable().optional(),
})

export const newsletterTemplateSchema = z.object({
  name: z.string().min(1, 'テンプレート名を入力してください').max(100),
  description: z.string().max(255).default(''),
  product_count: z.number().int().min(1).max(10),
  has_ranking: z.boolean().default(false),
  html_template: z.string().min(1, 'HTMLテンプレートを入力してください'),
  thumbnail_url: z.string().url().nullable().optional(),
  is_active: z.boolean().default(true),
})

export const featurePageSchema = z.object({
  title: z.string().min(1, 'タイトルを入力してください').max(255),
  template_id: z.string().uuid().nullable(),
  header_image_url: z.string().url().nullable().optional(),
  status: z.enum(['draft', 'published']).default('draft'),
})

export const featureProductSchema = z.object({
  product_url: z.string().url('有効なURLを入力してください'),
  product_name: z.string().nullable().optional(),
  s3_image_url: z.string().url().nullable().optional(),
  description: z.string().nullable().optional(),
  sort_order: z.number().int().min(0),
})

export const scrapeSchema = z.object({
  product_url: z.string().url('有効なURLを入力してください'),
  auto_upload_s3: z.boolean().default(true),
})

export const imageUploadSchema = z.object({
  image_type: z.enum(['product', 'banner', 'header', 'other']).default('other'),
})

export const bannerGenerateSchema = z.object({
  template_pattern: z.string().optional(),
  product_images: z.array(z.string().url()).default([]),
  main_text: z.string().optional(),
  newsletter_title: z.string().min(1),
  sub_text: z.string().optional(),
  width: z.number().int().default(800),
  height: z.number().int().default(400),
  page_context: z.string().optional(),
  reference_image_url: z.string().url().optional(),
  newsletter_id: z.string().uuid().optional(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type NewsletterInput = z.infer<typeof newsletterSchema>
export type NewsletterProductInput = z.infer<typeof newsletterProductSchema>
export type NewsletterTemplateInput = z.infer<typeof newsletterTemplateSchema>
export type FeaturePageInput = z.infer<typeof featurePageSchema>
export type FeatureProductInput = z.infer<typeof featureProductSchema>
export type ScrapeInput = z.infer<typeof scrapeSchema>
export type BannerGenerateInput = z.infer<typeof bannerGenerateSchema>
