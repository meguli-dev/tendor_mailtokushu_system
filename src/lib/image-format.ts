/**
 * 生成画像の保存形式をWebPにそろえる
 * PNGのままだとメール・特集ページで容量が大きすぎるため（2026-11 テンドール指摘）
 */
import sharp from 'sharp'

export const BANNER_OUTPUT_FORMAT = 'webp'
export const BANNER_WEBP_QUALITY = 80

/** 生成結果（base64）をWebPのBufferにする。すでにWebPならそのまま */
export async function toWebp(result: { imageData: string; mimeType: string }): Promise<{
  buffer: Buffer
  mimeType: 'image/webp'
  ext: 'webp'
}> {
  const input = Buffer.from(result.imageData, 'base64')
  const buffer = result.mimeType === 'image/webp'
    ? input
    : await sharp(input).webp({ quality: BANNER_WEBP_QUALITY }).toBuffer()
  return { buffer, mimeType: 'image/webp', ext: 'webp' }
}
