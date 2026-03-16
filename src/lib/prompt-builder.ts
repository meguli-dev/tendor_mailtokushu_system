export interface PromptBuilderInput {
  referenceImageUrl?: string
  productImages: { url: string; name: string }[]
  mainText: string
  subText?: string
  width: number
  height: number
  pageContext?: string
}

export function buildGenSparkPrompt(input: PromptBuilderInput): string {
  const lines: string[] = []

  lines.push(`${input.width}×${input.height}pxのバナー画像を作成してください。`)
  lines.push('')

  if (input.referenceImageUrl) {
    lines.push('【参考スタイル】')
    lines.push('添付の参考画像と同じレイアウト・トーンでデザインしてください。')
    lines.push(`参考画像URL: ${input.referenceImageUrl}`)
    lines.push('')
  }

  if (input.productImages.length > 0) {
    lines.push('【配置する商品画像】')
    input.productImages.forEach((img, i) => {
      lines.push(`${i + 1}. ${img.name}`)
      lines.push(`   画像URL: ${img.url}`)
    })
    lines.push('')
    lines.push('各商品画像を丸く切り抜いて（円形マスク）、バランスよく配置してください。')
    lines.push('')
  }

  lines.push('【テキスト】')
  lines.push(`メインテキスト: ${input.mainText}`)
  if (input.subText) {
    lines.push(`サブテキスト: ${input.subText}`)
  }
  lines.push('')

  lines.push('【デザイン指示】')
  lines.push('- メインテキストは大きく目立つように配置')
  lines.push('- サブテキストはメインテキストの下に小さめに配置')
  lines.push('- 背景は商品カテゴリに合った色合いとグラデーション')
  lines.push('- プロフェッショナルで清潔感のあるデザイン')
  lines.push('- 日本語フォントは読みやすいゴシック体を使用')

  if (input.pageContext) {
    lines.push('')
    lines.push('【ページコンテキスト】')
    lines.push(input.pageContext)
  }

  return lines.join('\n')
}
