'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Link2, MessageCircle, Search, Send, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { StageBadge } from '@/components/sfa/stage-badge'
import type { DealLine, DealOverview, LineUser } from '@/components/sfa/types'
import { api, fmtDateTime } from '@/components/sfa/utils'
import { cn } from '@/lib/utils'

export const fmtElapsed = (min: number | null | undefined) =>
  min == null ? '' : min < 60 ? `${min}分` : min < 1440 ? `${Math.floor(min / 60)}時間` : `${Math.floor(min / 1440)}日`

export function LineAvatar({ user, size = 36 }: { user: Pick<LineUser, 'picture_url' | 'display_name'>; size?: number }) {
  if (user.picture_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.picture_url} alt="" width={size} height={size} className="shrink-0 rounded-full border object-cover" style={{ width: size, height: size }} />
  }
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" style={{ width: size, height: size }}>
      <MessageCircle className="h-4 w-4" />
    </div>
  )
}

export function LineMessages({ user, max = 5 }: { user: LineUser; max?: number }) {
  const msgs = (user.messages ?? []).slice(0, max)
  if (!msgs.length) return <p className="text-xs text-muted-foreground">メッセージはまだありません（友だち追加のみ）</p>
  return (
    <div className="space-y-1">
      {[...msgs].reverse().map((m, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <span className="shrink-0 text-muted-foreground">{fmtDateTime(m.sent_at)}</span>
          <span className="whitespace-pre-wrap rounded-lg bg-muted px-2 py-1">{m.text}</span>
        </div>
      ))}
    </div>
  )
}

/** 対応済ボタン（メモは任意。案件に紐付いていれば接触履歴に残る） */
export function HandledButton({ user, onDone }: { user: LineUser; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      await api(`/api/sfa/line/${user.id}/handled`, { method: 'POST', json: { memo: memo.trim() || null } })
      toast.success('対応済にしました')
      setOpen(false)
      onDone()
    } catch { /* toast済み */ } finally {
      setBusy(false)
    }
  }
  if (!open) return <Button size="xs" onClick={() => setOpen(true)}><Check className="h-3 w-3" />対応済</Button>
  return (
    <div className="flex w-full gap-1">
      <Input className="h-7 text-xs" value={memo} onChange={(e) => setMemo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder={user.deal_id ? '返信内容のメモ（任意・接触履歴に残ります）' : 'メモ（任意）'} autoFocus />
      <Button size="xs" onClick={save} disabled={busy}>対応済</Button>
      <Button size="xs" variant="ghost" onClick={() => setOpen(false)}>戻る</Button>
    </div>
  )
}

/** 案件への紐付け（候補ボタン＋店舗名検索） */
export function LinkPicker({ user, onDone }: { user: LineUser; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<DealOverview[] | null>(null)

  async function link(dealId: number, name: string, note?: string) {
    setBusy(true)
    try {
      await api(`/api/sfa/line/${user.id}/link`, { method: 'POST', json: { deal_id: dealId, note: note ?? null } })
      toast.success(`${name} に紐付けました`)
      onDone()
    } catch { /* toast済み */ } finally {
      setBusy(false)
    }
  }

  async function search() {
    if (!q.trim()) return
    try {
      setResults(await api<DealOverview[]>(`/api/sfa/deals?q=${encodeURIComponent(q.trim())}&limit=10`))
    } catch { /* toast済み */ }
  }

  return (
    <div className="space-y-2">
      {!!user.candidates?.length && (
        <div className="flex flex-wrap gap-1">
          {user.candidates.map((c) => (
            <Button key={c.deal_id} size="xs" variant="outline" disabled={busy} title={c.reason}
              onClick={() => link(c.deal_id, c.company_name, c.reason)}>
              <Link2 className="h-3 w-3" />{c.company_name}（{Math.round(c.score * 100)}%・{c.reason}）
            </Button>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <Input className="h-7 text-xs" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder={user.candidates?.length ? '候補にない場合: 店舗名・電話番号で案件を検索' : '店舗名・電話番号で案件を検索'} />
        <Button size="xs" variant="outline" onClick={search}><Search className="h-3 w-3" /></Button>
      </div>
      {results && (
        <div className="space-y-1">
          {results.length === 0 && <p className="text-xs text-muted-foreground">見つかりませんでした</p>}
          {results.map((d) => (
            <button key={d.id} type="button" disabled={busy}
              className="flex w-full items-center gap-2 rounded border px-2 py-1 text-left text-xs hover:bg-muted"
              onClick={() => link(d.id, d.company_name)}>
              <span className="font-medium">{d.company_name}</span><StageBadge stage={d.stage} />
              {d.owner_name && <span className="text-muted-foreground">{d.owner_name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 案件詳細のLINE欄: 紐付いている友だち・受信メッセージ・対応済・SMS招待 */
export function DealLineCard({ dealId, line, phone, onChange }: {
  dealId: number; line: DealLine | null; phone: string | null; onChange: () => void
}) {
  const [invite, setInvite] = useState<{ text: string; sms_href: string | null } | null>(null)
  const [busy, setBusy] = useState(false)

  async function makeInvite() {
    setBusy(true)
    try {
      setInvite(await api<{ text: string; sms_href: string | null }>(`/api/sfa/deals/${dealId}/line`, { method: 'POST', json: { phone } }))
      onChange()
    } catch { /* toast済み */ } finally {
      setBusy(false)
    }
  }

  async function unlink(userId: number) {
    if (!confirm('このLINE友だちの紐付けを解除しますか？')) return
    try {
      await api(`/api/sfa/line/${userId}/link`, { method: 'POST', json: { deal_id: null } })
      toast.success('紐付けを解除しました')
      onChange()
    } catch { /* toast済み */ }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-4 w-4 text-green-600" />LINE</CardTitle>
        <Button size="xs" variant="outline" onClick={makeInvite} disabled={busy}><Send className="h-3 w-3" />SMSで招待</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {invite && (
          <div className="space-y-2 rounded-md border border-green-300 bg-green-50 p-2 text-xs dark:border-green-800 dark:bg-green-950/30">
            <p className="whitespace-pre-wrap">{invite.text}</p>
            <div className="flex flex-wrap gap-1">
              {invite.sms_href && <Button size="xs" asChild><a href={invite.sms_href}><Send className="h-3 w-3" />SMSアプリで開く</a></Button>}
              <Button size="xs" variant="outline" onClick={() => navigator.clipboard.writeText(invite.text).then(() => toast.success('コピーしました'))}>
                <Copy className="h-3 w-3" />文面をコピー
              </Button>
            </div>
            <p className="text-muted-foreground">招待した時刻を記録しました。友だち追加されると、この案件が紐付け候補の上位に出ます。</p>
          </div>
        )}
        {!line && <p className="text-xs text-muted-foreground">読み込み中…</p>}
        {line && line.users.length === 0 && (
          <p className="text-xs text-muted-foreground">
            紐付いているLINEはありません。友だち追加されたら「LINE」タブの未紐付けから、この案件に紐付けてください。
          </p>
        )}
        {line?.users.map((u) => (
          <div key={u.id} className={cn('space-y-2 rounded-md border p-2', u.pending_since && 'border-red-300 dark:border-red-800')}>
            <div className="flex items-center gap-2">
              <LineAvatar user={u} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{u.display_name ?? '名前不明'}</span>
                  {!u.is_friend && <span className="text-xs text-muted-foreground">ブロック中</span>}
                  {u.pending_since && <span className="rounded bg-red-100 px-1.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">未対応 {fmtElapsed(u.pending_minutes)}</span>}
                </div>
              </div>
              <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => unlink(u.id)}><Unlink className="h-3 w-3" /></Button>
            </div>
            <LineMessages user={u} max={10} />
            {u.pending_since && <HandledButton user={u} onDone={onChange} />}
          </div>
        ))}
        {!!line?.invites.length && (
          <p className="text-xs text-muted-foreground">
            招待履歴：{line.invites.map((i) => `${fmtDateTime(i.created_at)}${i.member ? `（${i.member.name}）` : ''}`).join('、')}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          返信はLINE公式アカウントのチャット画面から行い、返信したら「対応済」を押してください。<Link href="/sfa/line" className="underline">LINE一覧</Link>
        </p>
      </CardContent>
    </Card>
  )
}
