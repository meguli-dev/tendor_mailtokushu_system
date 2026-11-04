/**
 * 配信停止トークン: base64url(deliveryId) + "." + HMAC-SHA256 署名
 * deliveryId = 0 はテスト配信用（押しても停止しない）
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET
  if (!s) throw new Error('UNSUBSCRIBE_SECRET が設定されていません')
  return s
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url').slice(0, 32)
}

export function makeUnsubscribeToken(deliveryId: number): string {
  const payload = Buffer.from(String(deliveryId)).toString('base64url')
  return `${payload}.${sign(payload)}`
}

/** 正しいトークンなら deliveryId を返す（改ざん・不正形式は null） */
export function verifyUnsubscribeToken(token: string): number | null {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = sign(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const id = Number(Buffer.from(payload, 'base64url').toString())
  return Number.isInteger(id) && id >= 0 ? id : null
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://tendor-mailtokushu-system.vercel.app').replace(/\/$/, '')
}

export function unsubscribeUrls(deliveryId: number) {
  const t = makeUnsubscribeToken(deliveryId)
  return {
    page: `${appUrl()}/u/${t}`,
    oneClick: `${appUrl()}/api/mail/unsubscribe?t=${t}`,
  }
}
