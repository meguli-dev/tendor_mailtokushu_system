import { NextResponse } from 'next/server'
import { unsubscribe } from '@/lib/mail/service'
import { verifyUnsubscribeToken } from '@/lib/mail/token'

/**
 * 配信停止（公開・ログイン不要）
 * - Gmail・Yahooのワンクリック停止（List-Unsubscribe-Post）から直接POSTされる
 * - /u/[token] ページのボタンからもここにPOSTする
 * GETでは停止しない（メールのリンク安全チェックが自動でURLを開いても止まらないように）
 */
export async function POST(request: Request) {
  const t = new URL(request.url).searchParams.get('t') || ''
  const deliveryId = verifyUnsubscribeToken(t)
  if (deliveryId === null) return NextResponse.json({ error: 'リンクが正しくありません' }, { status: 400 })
  try {
    return NextResponse.json(await unsubscribe(deliveryId))
  } catch (e) {
    console.error('[mail unsubscribe]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : '配信停止に失敗しました' }, { status: 500 })
  }
}
