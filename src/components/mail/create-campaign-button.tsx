'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/components/sfa/utils'

/** メルマガの生成結果から配信を作り、配信画面へ移る */
export function CreateCampaignButton({ newsletterId, html, subject }: { newsletterId: string; html: string; subject: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      disabled={!newsletterId || !html || busy}
      onClick={async () => {
        setBusy(true)
        try {
          const c = await api<{ id: number }>('/api/mail/campaigns', { method: 'POST', json: { newsletter_id: newsletterId, html, subject } })
          router.push(`/mail/${c.id}`)
        } catch {
          setBusy(false)
        }
      }}
    >
      {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
      配信を作成
    </Button>
  )
}
