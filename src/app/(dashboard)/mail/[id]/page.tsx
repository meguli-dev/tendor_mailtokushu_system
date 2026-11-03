'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarClock, Download, Loader2, RefreshCw, Send, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { CampaignStatusBadge, pct } from '@/components/mail/status-badge'
import { api, fmtDateTime } from '@/components/sfa/utils'
import type { Campaign, CampaignStats } from '@/lib/mail/service'

interface Report {
  campaign: Campaign
  stats: CampaignStats
  links: Array<{ url: string; clicks: number; people: number }>
  clickers: Array<{ id: number; bcart_customer_id: number; email: string; comp_name: string | null; tanto_name: string | null; click_count: number; first_clicked_at: string; links: string[] }>
}

interface Recipient {
  id: number; bcart_customer_id: number; email: string; comp_name: string | null; tanto_name: string | null
  view_group_id: number | null; status: string; open_count: number; click_count: number; unsubscribed_at: string | null; error: string | null
}

const EDITABLE = ['draft', 'tested', 'scheduled']

/** datetime-local の初期値（翌日9:00、ブラウザのローカル時刻） */
function defaultScheduleValue() {
  const d = new Date(Date.now() + 24 * 3600_000)
  d.setHours(9, 0, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = '﻿' + rows.map((r) => r.map((v) => `"${(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function MailCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [c, setC] = useState<Campaign | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [previewKey, setPreviewKey] = useState(0)

  // 内容
  const [subject, setSubject] = useState('')
  const [preheader, setPreheader] = useState('')
  const [greeting, setGreeting] = useState(true)
  // テスト
  const [testTo, setTestTo] = useState('')
  const [liveSendEnabled, setLiveSendEnabled] = useState(false)
  // 本配信
  const [mode, setMode] = useState<'now' | 'schedule'>('now')
  const [scheduleAt, setScheduleAt] = useState(defaultScheduleValue)
  const [confirmCount, setConfirmCount] = useState('')
  // 宛先一覧
  const [showRecipients, setShowRecipients] = useState(false)
  const [recipients, setRecipients] = useState<{ rows: Recipient[]; total: number } | null>(null)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    const camp = await api<Campaign>(`/api/mail/campaigns/${id}`)
    setC(camp)
    if (['sending', 'sent', 'partial'].includes(camp.status)) setReport(await api<Report>(`/api/mail/campaigns/${id}/report`, { silent: true }).catch(() => null))
    return camp
  }, [id])

  useEffect(() => {
    load().then((camp) => {
      setSubject(camp.subject)
      setPreheader(camp.preheader ?? '')
      setGreeting(camp.greeting)
    }).catch(() => {})
    api<{ settings: { test_recipients: string[] }; liveSendEnabled: boolean }>('/api/mail/settings', { silent: true })
      .then((s) => { setTestTo(s.settings.test_recipients.join(', ')); setLiveSendEnabled(s.liveSendEnabled) }).catch(() => {})
  }, [load])

  // 送信中は3秒ごとに進捗を取り直す
  useEffect(() => {
    if (c?.status !== 'sending') return
    const t = setInterval(() => { load().catch(() => {}) }, 3000)
    return () => clearInterval(t)
  }, [c?.status, load])

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try { await fn() } catch { /* api() が toast 済み */ } finally { setBusy(null) }
  }

  const loadRecipients = useCallback(async (query = q) => {
    setRecipients(await api(`/api/mail/campaigns/${id}/audience?limit=100&q=${encodeURIComponent(query)}`))
  }, [id, q])

  if (!c) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  const editable = EDITABLE.includes(c.status)
  const dirty = subject !== c.subject || preheader !== (c.preheader ?? '') || greeting !== c.greeting
  const s = c.audience_summary
  const stats = report?.stats
  const base = stats ? (stats.delivered || stats.sent) : 0

  const saveContent = () => run('save', async () => {
    const next = await api<Campaign>(`/api/mail/campaigns/${id}`, { method: 'PATCH', json: { subject, preheader: preheader || null, greeting } })
    setC(next)
    setPreviewKey((k) => k + 1)
    toast.success(next.status === 'draft' && c.status !== 'draft' ? '保存しました。内容を変えたのでテスト配信からやり直してください' : '保存しました')
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href="/mail" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"><ArrowLeft className="h-3.5 w-3.5" />配信一覧</Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{c.subject}</h1>
            <CampaignStatusBadge status={c.status} />
          </div>
          {c.newsletter_id && <Link href={`/newsletter/${c.newsletter_id}`} className="text-xs text-muted-foreground hover:underline">元のメルマガを開く</Link>}
        </div>
        {['draft', 'tested'].includes(c.status) && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={busy !== null} onClick={() => run('delete', async () => {
            await api(`/api/mail/campaigns/${id}`, { method: 'DELETE' })
            toast.success('配信を削除しました')
            router.push('/mail')
          })}><Trash2 className="h-4 w-4" />この配信を削除</Button>
        )}
      </div>

      {/* ───── 進捗・レポート ───── */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{c.status === 'sending' ? '送信中' : '配信結果'}</CardTitle>
            <CardDescription>
              開始 {fmtDateTime(c.started_at)}{c.completed_at && ` ／ 完了 ${fmtDateTime(c.completed_at)}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {c.status === 'sending' && (
              <div className="space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${stats.total ? ((stats.total - stats.queued - stats.sending) / stats.total) * 100 : 0}%` }} />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">{(stats.total - stats.queued - stats.sending).toLocaleString()} / {stats.total.toLocaleString()} 件</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['送信', stats.sent, ''],
                ['到達', stats.delivered, pct(stats.delivered, stats.sent)],
                ['クリック', stats.clicked, pct(stats.clicked, base)],
                ['開封（参考）', stats.opened, pct(stats.opened, base)],
                ['配信停止', stats.unsubscribed, pct(stats.unsubscribed, base)],
                ['エラー・不達', stats.failed + stats.bounced, ''],
              ].map(([label, n, rate]) => (
                <div key={label as string} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-bold tabular-nums">{(n as number).toLocaleString()}</p>
                  {rate && <p className="text-xs text-muted-foreground tabular-nums">{rate}</p>}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">開封はiPhoneのメールアプリの先読みで多めに出るため参考値です。効果はクリックで見てください。</p>
            {c.status === 'partial' && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <span>{stats.failed}件の送信に失敗しました。</span>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run('resume', async () => {
                  await api(`/api/mail/campaigns/${id}/send`, { method: 'POST', json: { action: 'resume' } })
                  toast.success('失敗した宛先に再送します')
                  await load()
                })}>失敗分を再送</Button>
              </div>
            )}

            {report && report.links.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold">リンク別のクリック</h3>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="border-b text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">リンク</th><th className="px-3 py-2 text-right font-medium">人数</th><th className="px-3 py-2 text-right font-medium">回数</th></tr></thead>
                    <tbody>{report.links.map((l) => (
                      <tr key={l.url} className="border-b last:border-0">
                        <td className="max-w-[480px] truncate px-3 py-2"><a href={l.url} target="_blank" rel="noreferrer" className="hover:underline">{l.url}</a></td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.people}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{l.clicks}</td>
                      </tr>))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {report && report.clickers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">クリックした会員（{report.clickers.length}件）</h3>
                  <Button size="sm" variant="outline" onClick={() => downloadCsv(`click_${id}.csv`, [
                    ['BカートID', '会社名', '担当者名', 'メール', 'クリック数', '最初のクリック', 'クリックしたリンク'],
                    ...report.clickers.map((r) => [String(r.bcart_customer_id), r.comp_name ?? '', r.tanto_name ?? '', r.email, String(r.click_count), fmtDateTime(r.first_clicked_at), r.links.join(' ')]),
                  ])}><Download className="h-4 w-4" />CSV</Button>
                </div>
                <div className="max-h-80 overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 border-b bg-background text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">会社名</th><th className="px-3 py-2 text-left font-medium">担当者</th><th className="px-3 py-2 text-right font-medium">クリック</th><th className="px-3 py-2 text-left font-medium">最初のクリック</th></tr></thead>
                    <tbody>{report.clickers.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="px-3 py-2">{r.comp_name}</td>
                        <td className="px-3 py-2">{r.tanto_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.click_count}</td>
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDateTime(r.first_clicked_at)}</td>
                      </tr>))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {/* ───── 1. 内容 ───── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. 件名と冒頭</CardTitle>
              <CardDescription>本文はメルマガビルダーで作ったHTMLです。配信停止リンクと発行者情報のフッターは自動で付きます。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="subject">件名</Label>
                <Input id="subject" value={subject} disabled={!editable} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="preheader">プレヘッダー（受信一覧で件名の横に出る短い文）</Label>
                <Input id="preheader" value={preheader} disabled={!editable} placeholder="例: 今月のおすすめ容器と期間限定価格のご案内" onChange={(e) => setPreheader(e.target.value)} />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">冒頭に宛名を入れる</p>
                  <p className="text-xs text-muted-foreground">「株式会社〇〇 / 〇〇 様」をBカートの会社名・担当者名で差し込みます。件名や本文に {'{{会社名}}'} {'{{担当者名}}'} と書いても差し込めます。</p>
                </div>
                <Switch id="greeting" checked={greeting} disabled={!editable} onCheckedChange={setGreeting} />
              </div>
              {editable && (
                <div className="flex justify-end">
                  <Button size="sm" disabled={!dirty || busy !== null} onClick={saveContent}>
                    {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />}保存
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ───── 2. 宛先 ───── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. 宛先</CardTitle>
              <CardDescription>送る直前に「宛先を更新」を押すと、Bカートの最新の会員情報から送る人を決めます。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant={c.audience_refreshed_at ? 'outline' : 'default'} disabled={!editable || busy !== null} onClick={() => run('audience', async () => {
                  const next = await api<Campaign>(`/api/mail/campaigns/${id}/audience`, { method: 'POST' })
                  setC(next)
                  setConfirmCount('')
                  if (showRecipients) await loadRecipients()
                  toast.success(`宛先を更新しました（${next.recipient_count?.toLocaleString()}件）${c.status === 'scheduled' ? '。予約は外れたので、件数を確認して予約し直してください' : ''}`)
                })}>
                  {busy === 'audience' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  宛先を更新
                </Button>
                <span className="text-sm text-muted-foreground">
                  {c.audience_refreshed_at ? `最終更新 ${fmtDateTime(c.audience_refreshed_at)}` : 'まだ宛先を取得していません'}
                </span>
              </div>

              {s && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Bカート会員</p><p className="text-lg font-bold tabular-nums">{s.total_customers.toLocaleString()}</p></div>
                    <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">メルマガ受信ON</p><p className="text-lg font-bold tabular-nums">{s.mm_on.toLocaleString()}</p></div>
                    <div className="rounded-md border border-primary/50 bg-primary/5 p-3"><p className="text-xs text-muted-foreground">送る人</p><p className="text-lg font-bold tabular-nums">{s.eligible.toLocaleString()}</p></div>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3 text-sm">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">受信ONのうち送らない人</p>
                    <ul className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
                      {s.excluded.by_group.map((g) => <li key={g.id} className="flex justify-between"><span>{g.name}</span><span className="tabular-nums">{g.count}</span></li>)}
                      <li className="flex justify-between"><span>会員ステータス無効</span><span className="tabular-nums">{s.excluded.inactive}</span></li>
                      <li className="flex justify-between"><span>メールアドレス無効</span><span className="tabular-nums">{s.excluded.invalid_email}</span></li>
                      <li className="flex justify-between"><span>配信停止済み</span><span className="tabular-nums">{s.excluded.suppressed}</span></li>
                      <li className="flex justify-between"><span>アドレス重複</span><span className="tabular-nums">{s.excluded.duplicate}</span></li>
                    </ul>
                    {(s.resubscribed ?? 0) > 0 && <p className="mt-2 text-xs">配信停止のあとBカートで受信をONに戻した {s.resubscribed}件 は、停止リストから外して送る人に戻しました。</p>}
                    <p className="mt-2 text-xs text-muted-foreground">送らないグループは<Link href="/mail/settings" className="underline">配信設定</Link>で変えられます。</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={async () => {
                    const next = !showRecipients
                    setShowRecipients(next)
                    if (next && !recipients) await loadRecipients().catch(() => {})
                  }}><Users className="h-4 w-4" />{showRecipients ? '宛先一覧を閉じる' : '宛先一覧を見る'}</Button>
                  {showRecipients && recipients && (
                    <div className="space-y-2">
                      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); loadRecipients().catch(() => {}) }}>
                        <Input id="recipient-q" value={q} placeholder="会社名・担当者名・メールで検索" onChange={(e) => setQ(e.target.value)} />
                        <Button type="submit" variant="outline" size="sm">検索</Button>
                      </form>
                      <p className="text-xs text-muted-foreground">{recipients.total.toLocaleString()}件{recipients.total > recipients.rows.length && `（先頭${recipients.rows.length}件を表示）`}</p>
                      <div className="max-h-72 overflow-auto rounded-md border">
                        <table className="w-full text-xs">
                          <tbody>{recipients.rows.map((r) => (
                            <tr key={r.id} className="border-b last:border-0">
                              <td className="px-2 py-1.5">{r.comp_name}</td>
                              <td className="px-2 py-1.5">{r.tanto_name}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{r.email}</td>
                              <td className="px-2 py-1.5 text-muted-foreground" title={r.error ?? undefined}>{r.status === 'queued' ? '' : r.status}</td>
                            </tr>))}</tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ───── 3. テスト配信 ───── */}
          {editable && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">3. テスト配信</CardTitle>
                <CardDescription>本番と同じ組み立てで、件名に [テスト] を付けて送ります（5件まで）。宛先を更新済みなら、1件目の会社名・担当者名で差し込みます。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea id="test-to" rows={2} value={testTo} placeholder="you@example.com, other@example.com" onChange={(e) => setTestTo(e.target.value)} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">{c.test_sent_at ? `最終テスト ${fmtDateTime(c.test_sent_at)}` : 'まだテストしていません'}</span>
                  <Button variant="outline" disabled={dirty || busy !== null} onClick={() => run('test', async () => {
                    const r = await api<{ sent: number }>(`/api/mail/campaigns/${id}/test`, { method: 'POST', json: { emails: testTo.split(/[,\s、]+/).filter(Boolean) } })
                    toast.success(`${r.sent}件にテスト配信しました`)
                    await load()
                  })}>
                    {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}テスト配信
                  </Button>
                </div>
                {dirty && <p className="text-xs text-muted-foreground">件名などの変更を保存してからテストしてください。</p>}
              </CardContent>
            </Card>
          )}

          {/* ───── 4. 本配信・予約 ───── */}
          {editable && (
            <Card className={c.status === 'scheduled' ? 'border-violet-400' : undefined}>
              <CardHeader>
                <CardTitle className="text-base">4. 本配信</CardTitle>
                <CardDescription>テスト配信と宛先の更新が済むと送れます。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {c.status === 'scheduled' ? (
                  <div className="space-y-3">
                    <p className="flex items-center gap-2 text-sm"><CalendarClock className="h-4 w-4" /><span className="font-bold">{fmtDateTime(c.scheduled_at)}</span> に {c.recipient_count?.toLocaleString()}件へ送信予約しています。</p>
                    <p className="text-xs text-muted-foreground">宛先は {fmtDateTime(c.audience_refreshed_at)} に更新したものを使います（予約時刻までに配信停止した人は自動で除きます）。宛先を更新し直すと、件数を確認し直すため予約は外れます。</p>
                    <Button variant="outline" disabled={busy !== null} onClick={() => run('cancel', async () => {
                      setC(await api<Campaign>(`/api/mail/campaigns/${id}/send`, { method: 'POST', json: { action: 'cancel_schedule' } }))
                      toast.success('予約を取り消しました')
                    })}>予約を取り消す</Button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Button size="sm" variant={mode === 'now' ? 'secondary' : 'ghost'} onClick={() => setMode('now')}>今すぐ送る</Button>
                      <Button size="sm" variant={mode === 'schedule' ? 'secondary' : 'ghost'} onClick={() => setMode('schedule')}>日時を予約</Button>
                    </div>
                    {mode === 'schedule' && (
                      <div className="space-y-1.5">
                        <Label htmlFor="schedule-at">配信日時</Label>
                        <Input id="schedule-at" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="w-auto" />
                      </div>
                    )}
                    <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                      <p className="text-sm font-bold">最終確認</p>
                      <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 text-sm">
                        <dt className="text-muted-foreground">件名</dt><dd className="font-medium">{c.subject}</dd>
                        <dt className="text-muted-foreground">送信数</dt><dd className="font-medium tabular-nums">{c.recipient_count ? `${c.recipient_count.toLocaleString()}件` : '宛先が未取得です'}</dd>
                        <dt className="text-muted-foreground">送信日時</dt><dd className="font-medium">{mode === 'schedule' ? (scheduleAt ? scheduleAt.replace('T', ' ') : '—') : '今すぐ'}</dd>
                      </dl>
                      <div className="space-y-1.5">
                        <Label htmlFor="confirm-count">送信数を入力</Label>
                        <Input id="confirm-count" inputMode="numeric" className="w-40 bg-background" placeholder={c.recipient_count ? String(c.recipient_count) : ''} value={confirmCount} onChange={(e) => setConfirmCount(e.target.value.replace(/[^0-9]/g, ''))} />
                        <p className="text-xs text-muted-foreground">上の送信数と同じ数字を入れると、送信ボタンが押せるようになります。送信後は取り消せません。</p>
                      </div>
                    </div>
                    <Button
                      disabled={!liveSendEnabled || c.status !== 'tested' || !c.recipient_count || Number(confirmCount) !== c.recipient_count || busy !== null}
                      onClick={() => run('send', async () => {
                        const next = await api<Campaign>(`/api/mail/campaigns/${id}/send`, {
                          method: 'POST',
                          json: { action: 'send', confirm_count: Number(confirmCount), scheduled_at: mode === 'schedule' ? new Date(scheduleAt).toISOString() : null },
                        })
                        setC(next)
                        toast.success(mode === 'schedule' ? '予約しました' : '送信を始めました')
                        if (mode === 'now') await load()
                      })}
                    >
                      {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'schedule' ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                      {mode === 'schedule' ? '予約する' : `${c.recipient_count?.toLocaleString() ?? ''}件に送信する`}
                    </Button>
                    {!liveSendEnabled && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">本配信は準備中です。送信ドメイン（mail.yo-ki-navi.com）の認証が済んだら押せるようになります。テスト配信は使えます。</p>}
                    {liveSendEnabled && c.status === 'draft' && <p className="text-xs text-muted-foreground">先にテスト配信をしてください。</p>}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ───── プレビュー ───── */}
        <Card className="h-fit lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="text-base">プレビュー</CardTitle>
            <CardDescription>実際に送る組み立て（宛名・フッター込み）です。保存後に更新されます。</CardDescription>
          </CardHeader>
          <CardContent>
            <iframe key={previewKey} title="プレビュー" src={`/api/mail/campaigns/${id}?preview=1`} className="h-[720px] w-full rounded-md border bg-white" sandbox="" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
