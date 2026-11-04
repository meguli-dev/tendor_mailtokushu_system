'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CampaignStatusBadge } from '@/components/mail/status-badge'
import { api, fmtDateTime } from '@/components/sfa/utils'
import type { CampaignStatus } from '@/lib/mail/service'

interface SendableNewsletter {
  id: string
  title: string
  subject: string
  updated_at: string
  campaigns: Array<{ id: number; status: CampaignStatus; started_at: string | null }>
}

/** 作成済みのメルマガを選んで配信を作る */
export function NewsletterPicker() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<SendableNewsletter[] | null>(null)
  const [creating, setCreating] = useState<string | null>(null)

  const openDialog = async () => {
    setOpen(true)
    setList(null)
    setList(await api<SendableNewsletter[]>('/api/mail/newsletters').catch(() => []))
  }

  const create = async (n: SendableNewsletter) => {
    setCreating(n.id)
    try {
      const c = await api<{ id: number }>('/api/mail/campaigns', { method: 'POST', json: { newsletter_id: n.id } })
      router.push(`/mail/${c.id}`)
    } catch {
      setCreating(null)
    }
  }

  return (
    <>
      <Button onClick={openDialog}><Plus className="h-4 w-4" />新しい配信</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>配信するメルマガを選ぶ</DialogTitle>
            <DialogDescription>メルマガビルダーでHTMLを出力したものが並びます（新しい順）。</DialogDescription>
          </DialogHeader>
          {list === null ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : list.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              配信できるメルマガがまだありません。<Link href="/newsletter/new" className="underline">メルマガを作成</Link>してください。
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y overflow-auto rounded-md border">
              {list.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-sm font-medium">{n.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      更新 {fmtDateTime(n.updated_at)}
                      {n.campaigns.map((c) => (
                        <Link key={c.id} href={`/mail/${c.id}`} className="ml-2 inline-flex align-middle"><CampaignStatusBadge status={c.status} /></Link>
                      ))}
                    </p>
                  </div>
                  <Button size="sm" variant={n.campaigns.length ? 'outline' : 'default'} disabled={creating !== null} onClick={() => create(n)}>
                    {creating === n.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    {n.campaigns.length ? 'もう一度配信を作る' : 'この内容で配信を作る'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
