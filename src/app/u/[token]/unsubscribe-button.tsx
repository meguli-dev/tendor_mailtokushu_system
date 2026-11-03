'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function UnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  if (state === 'done') {
    return <p className="text-sm font-medium">配信を停止しました。これまでご購読いただきありがとうございました。</p>
  }
  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy')
          const res = await fetch(`/api/mail/unsubscribe?t=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => null)
          setState(res?.ok ? 'done' : 'error')
        }}
      >
        {state === 'busy' && <Loader2 className="h-4 w-4 animate-spin" />}
        配信を停止する
      </Button>
      {state === 'error' && <p className="text-sm text-destructive">手続きに失敗しました。時間をおいてもう一度お試しください。</p>}
    </div>
  )
}
