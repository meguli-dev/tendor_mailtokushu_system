import type { NewsletterWithProducts, NewsletterTemplate } from '@/types'

interface TemplateVariables {
  [key: string]: string | undefined
}

/**
 * Replace template variables like {{VARIABLE_NAME}} with actual values
 */
function replaceVariables(template: string, variables: TemplateVariables): string {
  let result = template

  // Replace simple variables
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    result = result.replace(pattern, value || '')
  }

  // Process conditional blocks: <!--IF:VARIABLE-->...<!--ENDIF:VARIABLE-->
  const conditionalPattern = /<!--IF:(\w+)-->([\s\S]*?)<!--ENDIF:\1-->/g
  result = result.replace(conditionalPattern, (_, varName, content) => {
    const value = variables[varName]
    return value ? content : ''
  })

  return result
}

/**
 * Build template variables from newsletter data
 */
function buildVariables(newsletter: NewsletterWithProducts): TemplateVariables {
  const vars: TemplateVariables = {
    NEWSLETTER_TITLE: newsletter.title,
    HEADER_IMAGE: newsletter.header_image_url || undefined,
    FEATURE_TITLE: newsletter.feature_title || undefined,
    FEATURE_DESCRIPTION: newsletter.feature_description || undefined,
  }

  // Regular products
  const regularProducts = newsletter.products
    .filter((p) => !p.is_ranking)
    .sort((a, b) => a.sort_order - b.sort_order)

  regularProducts.forEach((product, index) => {
    const num = index + 1
    vars[`PRODUCT_${num}_NAME`] = product.product_name || undefined
    vars[`PRODUCT_${num}_IMAGE`] = product.s3_image_url || product.product_image_url || undefined
    vars[`PRODUCT_${num}_URL`] = product.product_url
  })

  // Ranking products
  const rankingProducts = newsletter.products
    .filter((p) => p.is_ranking)
    .sort((a, b) => (a.rank_position || 0) - (b.rank_position || 0))

  rankingProducts.forEach((product, index) => {
    const num = index + 1
    vars[`RANKING_${num}_NAME`] = product.product_name || undefined
    vars[`RANKING_${num}_IMAGE`] = product.s3_image_url || product.product_image_url || undefined
    vars[`RANKING_${num}_URL`] = product.product_url
  })

  return vars
}

/**
 * Generate HTML from newsletter data using its template
 */
export function generateNewsletterHtml(
  newsletter: NewsletterWithProducts,
  template: NewsletterTemplate
): string {
  const variables = buildVariables(newsletter)
  return replaceVariables(template.html_template, variables)
}

/**
 * Generate HTML from raw template and variables (for preview)
 */
export function generateFromTemplate(
  htmlTemplate: string,
  variables: TemplateVariables
): string {
  return replaceVariables(htmlTemplate, variables)
}
