/**
 * 生成画像の保存形式
 *   JPEG（品質80）にそろえる。WebPは従来版Outlookで表示されないためメルマガでは使わない
 *   PNGのままだとメール・特集ページで容量が大きすぎるため（2026-11 テンドール指摘）
 *   gpt-image は 1024x1024 / 1536x1024 / 1024x1536 でしか出せないので、画面で選んだサイズに
 *   中央基準で縮小・切り抜きして保存する（ワイド1200x628は1536x1024の上下を切り落とす）
 *
 * sharp は処理の中で必要になったときだけ読み込む。
 *   2026-11-05、モジュール先頭で import していたため、Vercel上で libvips を読み込めず生成が全滅した。
 *   読み込み・変換に失敗しても生成は止めず、gpt-image が出したJPEGをそのまま保存する。
 */
export const BANNER_OUTPUT_FORMAT = 'jpeg'
export const BANNER_JPEG_QUALITY = 80

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

async function loadSharp() {
  return (await import('sharp')).default
}

/** 生成結果（base64）を保存用のJPEGにする。size があればそのサイズに縮小・切り抜く */
export async function toBannerFile(
  result: { imageData: string; mimeType: string },
  size?: { width: number; height: number } | null,
): Promise<{ buffer: Buffer; mimeType: string; ext: string; resized: boolean }> {
  const input = Buffer.from(result.imageData, 'base64')
  try {
    const sharp = await loadSharp()
    let img = sharp(input)
    if (size?.width && size?.height) img = img.resize(size.width, size.height, { fit: 'cover', position: 'centre' })
    const buffer = await img.jpeg({ quality: BANNER_JPEG_QUALITY, mozjpeg: true }).toBuffer()
    return { buffer, mimeType: 'image/jpeg', ext: 'jpg', resized: !!size }
  } catch (e) {
    console.error('[image-format] 縮小・JPEG変換に失敗。生成画像をそのまま保存します', e)
    const mimeType = EXT[result.mimeType] ? result.mimeType : 'image/jpeg'
    return { buffer: input, mimeType, ext: EXT[mimeType], resized: false }
  }
}

/** 画像URLの縦横サイズ（修正時に元画像と同じサイズへ戻すため）。取れなければ null */
export async function imageSizeOf(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const meta = await (await loadSharp())(Buffer.from(await res.arrayBuffer())).metadata()
    return meta.width && meta.height ? { width: meta.width, height: meta.height } : null
  } catch {
    return null
  }
}
