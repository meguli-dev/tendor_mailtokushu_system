'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { fmtElapsed, HandledButton, LineAvatar, LineMessages, LinkPicker } from '@/components/sfa/line-parts'
import type { LineUser } from '@/components/sfa/types'
import { api, fmtDateTime } from '@/components/sfa/utils'
import { cn } from '@/lib/utils'

export default function SfaLinePage() {
  const [mine, setMine] = useState(false)
  const [data, setData] = useState<{ pending: LineUser[]; unlinked: LineUser[] } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api<{ pending: LineUser[]; unlinked: LineUser[] }>(`/api/sfa/line${mine ? '?mine=1' : ''}`))
    } catch {
      setData({ pending: [], unlinked: [] })
    } finally {
      setLoading(false)
    }
  }, [mine])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">LINE</h1>
          <p className="text-sm text-muted-foreground">
            返信はLINE公式アカウントのチャット画面から行います。返信したら「対応済」を押してください（Chatwork通知に「済」と返信しても対応済になります）。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={mine} onCheckedChange={setMine} />自分の担当のみ
          </label>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />更新
          </Button>
        </div>
      </div>

      {!data && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-red-600 dark:text-red-400">
                未対応<span className="rounded-full bg-muted px-2 text-xs text-foreground">{data.pending.length}</span>
              </CardTitle>
              <CardDescription>お客様からメッセージが届いて、まだ対応済になっていないもの（古い順）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.pending.length === 0 && <p className="text-sm text-muted-foreground">未対応はありません</p>}
              {data.pending.map((u) => (
                <div key={u.id} className="space-y-2 rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <LineAvatar user={u} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {u.deal_id
                          ? <Link href={`/sfa/deals/${u.deal_id}`} className="font-medium hover:underline">{u.company_name}</Link>
                          : <span className="font-medium text-orange-600 dark:text-orange-400">未紐付け</span>}
                        <span className="text-xs text-muted-foreground">LINE：{u.display_name ?? '名前不明'}</span>
                        {u.owner_name && <span className="text-xs text-muted-foreground">担当：{u.owner_name}</span>}
                        <span className={cn('rounded px-1.5 text-xs', (u.pending_minutes ?? 0) >= 120
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300')}>
                          {fmtElapsed(u.pending_minutes)}経過
                        </span>
                      </div>
                    </div>
                  </div>
                  <LineMessages user={u} max={3} />
                  <HandledButton user={u} onDone={load} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                未紐付け<span className="rounded-full bg-muted px-2 text-xs">{data.unlinked.length}</span>
              </CardTitle>
              <CardDescription>
                友だち追加されたが、どの案件のお客様か決まっていない人。候補は SMS招待の時刻・表示名・メッセージの店舗名から出しています。
                ClaudeからもMCP（sfa_line_unlinked → sfa_line_link）で紐付けできます。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.unlinked.length === 0 && <p className="text-sm text-muted-foreground">未紐付けはありません</p>}
              {data.unlinked.map((u) => (
                <div key={u.id} className="space-y-2 rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <LineAvatar user={u} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{u.display_name ?? '名前不明'}</span>
                        {u.followed_at && <span className="text-xs text-muted-foreground">友だち追加 {fmtDateTime(u.followed_at)}</span>}
                        {u.pending_since && <span className="rounded bg-red-100 px-1.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">未対応</span>}
                      </div>
                    </div>
                  </div>
                  <LineMessages user={u} max={3} />
                  <LinkPicker user={u} onDone={load} />
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
