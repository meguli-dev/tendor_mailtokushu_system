import { Resend } from 'resend'

let client: Resend | null = null

/** Resendクライアント（遅延初期化。ビルド時に環境変数がなくても落ちないように） */
export function resend(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY が設定されていません')
    client = new Resend(key)
  }
  return client
}
