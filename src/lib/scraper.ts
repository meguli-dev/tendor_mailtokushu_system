import * as cheerio from 'cheerio'
import { SCRAPE_SELECTORS, SCRAPE_TIMEOUT_MS, YOKINAVI_BASE_URL } from './constants'

export interface ScrapedProduct {
  productName: string
  imageUrl: string
  productId: string | null
}

export async function scrapeProduct(productUrl: string): Promise<ScrapedProduct> {
  // Validate URL is from yo-ki-navi
  const url = new URL(productUrl)
  if (!url.hostname.includes('yo-ki-navi.com')) {
    throw new Error('容器なび (yo-ki-navi.com) のURLのみ対応しています')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS)

  try {
    const response = await fetch(productUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!response.ok) {
      throw new Error(`商品ページの取得に失敗しました: ${response.status}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Extract product name
    const productName = $(SCRAPE_SELECTORS.productTitle).first().text().trim()
    if (!productName) {
      throw new Error('商品名を取得できませんでした')
    }

    // Extract main product image
    const imageEl = $(SCRAPE_SELECTORS.mainImage).first()
    let imageUrl = imageEl.attr('src') || ''

    if (!imageUrl) {
      throw new Error('商品画像を取得できませんでした')
    }

    // Make absolute URL if relative
    if (imageUrl.startsWith('/')) {
      imageUrl = `${YOKINAVI_BASE_URL}${imageUrl}`
    } else if (!imageUrl.startsWith('http')) {
      imageUrl = `${YOKINAVI_BASE_URL}/${imageUrl}`
    }

    // Extract product ID from URL
    const productId = url.searchParams.get('id')

    return {
      productName,
      imageUrl,
      productId,
    }
  } finally {
    clearTimeout(timeout)
  }
}
