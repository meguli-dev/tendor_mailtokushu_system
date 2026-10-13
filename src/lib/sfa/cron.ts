/** Vercel Cron の認証（CRON_SECRET を設定すると Vercel が Authorization: Bearer を付けて呼ぶ） */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}
