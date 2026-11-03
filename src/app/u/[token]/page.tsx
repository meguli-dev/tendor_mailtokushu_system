import type { Metadata } from 'next'
import { describeUnsubscribe } from '@/lib/mail/service'
import { verifyUnsubscribeToken } from '@/lib/mail/token'
import { UnsubscribeButton } from './unsubscribe-button'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'メールマガジンの配信停止 | 容器なび', robots: { index: false } }

function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`
}

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const deliveryId = verifyUnsubscribeToken(token)
  const info = deliveryId === null ? null : await describeUnsubscribe(deliveryId).catch(() => null)

  return (
    <main className="min-h-screen bg-muted/30 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-lg border bg-background p-8 shadow-sm space-y-5 text-center">
        <p className="text-sm font-bold text-muted-foreground">容器なび</p>
        <h1 className="text-xl font-bold">メールマガジンの配信停止</h1>
        {!info ? (
          <p className="text-sm text-muted-foreground">リンクが正しくないか、有効期限が切れています。お手数ですが、届いたメールのリンクからもう一度お試しください。</p>
        ) : info.done ? (
          <p className="text-sm">配信停止の手続きは完了しています。</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {info.test
                ? 'これはテスト配信のリンクです。押しても配信停止はされません。'
                : <>{maskEmail(info.email!)} への容器なびメールマガジンの配信を停止します。</>}
            </p>
            <UnsubscribeButton token={token} />
          </>
        )}
      </div>
    </main>
  )
}
