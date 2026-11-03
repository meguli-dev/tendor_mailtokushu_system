'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, fmtDateTime } from '@/components/sfa/utils'
import type { MailSettings } from '@/lib/mail/service'

interface SettingsResponse {
  settings: MailSettings
  viewGroups: Array<{ id: number; name: string }>
  defaultFooterHtml: string
  envFromEmail: string | null
  suppressions: Array<{ id: number; email: string; reason: string; created_at: string; bcart_synced_at: string | null; bcart_sync_error: string | null }>
}

const REASON: Record<string, string> = { unsubscribed: '配信停止', bounced: '不達', complained: '迷惑メール報告', manual: '手動' }

export default function MailSettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null)
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [excluded, setExcluded] = useState<number[]>([])
  const [footer, setFooter] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<SettingsResponse>('/api/mail/settings').then((d) => {
      setData(d)
      setFromName(d.settings.from_name)
      setFromEmail(d.settings.from_email ?? '')
      setReplyTo(d.settings.reply_to ?? '')
      setExcluded(d.settings.excluded_view_group_ids)
      setFooter(d.settings.footer_html ?? d.defaultFooterHtml)
    }).catch(() => {})
  }, [])

  if (!data) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  const save = async () => {
    setSaving(true)
    try {
      await api('/api/mail/settings', {
        method: 'PUT',
        json: {
          from_name: fromName,
          from_email: fromEmail.trim() || null,
          reply_to: replyTo.trim() || null,
          excluded_view_group_ids: excluded,
          footer_html: footer.trim() === data.defaultFooterHtml.trim() ? null : footer,
        },
      })
      toast.success('配信設定を保存しました')
    } catch { /* toast済み */ } finally { setSaving(false) }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <Link href="/mail" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"><ArrowLeft className="h-3.5 w-3.5" />配信一覧</Link>
        <h1 className="text-2xl font-bold">配信設定</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">送らない会員グループ</CardTitle>
          <CardDescription>Bカートの閲覧グループ（管理画面の絞り込み項目と同じ）でチェックしたものには送りません。グループなしの会員（通常会員）には送ります。</CardDescription>
        </CardHeader>
        <CardContent>
          {data.viewGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bカートから閲覧グループを取得できませんでした。</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.viewGroups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <input
                    id={`vg-${g.id}`}
                    type="checkbox"
                    className="h-4 w-4"
                    checked={excluded.includes(g.id)}
                    onChange={(e) => setExcluded((prev) => e.target.checked ? [...prev, g.id] : prev.filter((x) => x !== g.id))}
                  />
                  {g.name}
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">差出人</CardTitle>
          <CardDescription>差出人アドレスは、Resendで認証済みのドメインのものにしてください（未認証のドメインからは送れません）。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="from-name">差出人名</Label>
            <Input id="from-name" value={fromName} onChange={(e) => setFromName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="from-email">差出人アドレス</Label>
            <Input id="from-email" value={fromEmail} placeholder={data.envFromEmail ?? 'news@mail.yo-ki-navi.com'} onChange={(e) => setFromEmail(e.target.value)} />
            {!fromEmail && <p className="text-xs text-muted-foreground">空欄のときは {data.envFromEmail ?? '（未設定）'} を使います。</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reply-to">返信先アドレス</Label>
            <Input id="reply-to" value={replyTo} placeholder="返信を受け取るテンドールのアドレス" onChange={(e) => setReplyTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">フッター（発行者情報）</CardTitle>
          <CardDescription>全メールの末尾に付きます。法律で表示が必要なので、会社名・住所・問い合わせ先と配信停止リンク {'{{UNSUBSCRIBE_URL}}'} は消さないでください。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea id="footer-html" rows={10} className="font-mono text-xs" value={footer} onChange={(e) => setFooter(e.target.value)} />
          <div className="rounded-md border bg-white p-2" dangerouslySetInnerHTML={{ __html: footer.replaceAll('{{UNSUBSCRIBE_URL}}', '#') }} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}設定を保存</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">配信停止リスト（{data.suppressions.length}件）</CardTitle>
          <CardDescription>ここにあるアドレスには、Bカートの受信フラグに関係なく送りません。配信停止はBカートの受信フラグにも書き戻します。</CardDescription>
        </CardHeader>
        <CardContent>
          {data.suppressions.length === 0 ? (
            <p className="text-sm text-muted-foreground">まだありません。</p>
          ) : (
            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b bg-background text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2 text-left font-medium">アドレス</th><th className="px-3 py-2 text-left font-medium">理由</th><th className="px-3 py-2 text-left font-medium">日時</th><th className="px-3 py-2 text-left font-medium">Bカート反映</th></tr>
                </thead>
                <tbody>{data.suppressions.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{r.email}</td>
                    <td className="px-3 py-2">{REASON[r.reason] ?? r.reason}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDateTime(r.created_at)}</td>
                    <td className="px-3 py-2 text-xs" title={r.bcart_sync_error ?? undefined}>
                      {r.reason === 'bounced' ? '—' : r.bcart_synced_at ? '済み' : r.bcart_sync_error ? '失敗（自動で再試行）' : '待ち'}
                    </td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
