'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

async function postForm(url: string, form: FormData) {
  const res = await fetch(url, { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || '処理に失敗しました')
  return data
}

/** 見積書のアップロード（テンドール・管理者用）。dealId を渡すと見積依頼なしで案件に直接登録する */
export function QuoteUploadDialog({ quoteRequestId, dealId, title, open, onOpenChange, onSaved }: {
  quoteRequestId: number | null; dealId?: number; title?: string; open: boolean; onOpenChange: (o: boolean) => void; onSaved?: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setFile(null); setNote('') } }, [open])

  async function save() {
    if ((!quoteRequestId && !dealId) || !file) { toast.error('ファイルを選択してください'); return }
    setSaving(true)
    try {
      const form = new FormData()
      form.append('file', file)
      if (note.trim()) form.append('note', note.trim())
      const url = quoteRequestId ? `/api/sfa/quote-requests/${quoteRequestId}/files` : `/api/sfa/deals/${dealId}/quote-files`
      const r = (await postForm(url, form)) as { version: number }
      toast.success(`見積書 第${r.version}版を登録しました`)
      onOpenChange(false)
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'アップロードに失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>見積書をアップロード</DialogTitle>
          <DialogDescription>
            {title}{quoteRequestId ? `（#Q-${quoteRequestId}）` : ''}。
            {quoteRequestId ? '版は自動で採番され、' : '依頼中の見積があればその次の版として、無ければ新しい見積として登録され、'}対応担当に通知されます。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input type="file" accept=".pdf,.xlsx,.xls,.docx,.doc" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <div className="space-y-1">
            <Label>メモ（修正内容など・任意）</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button onClick={save} disabled={saving || !file}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}アップロード</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 修正依頼（見積書ルームに投稿される） */
export function RevisionDialog({ quoteRequestId, open, onOpenChange, onSaved }: {
  quoteRequestId: number | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved?: () => void
}) {
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setNote(''); setFile(null) } }, [open])

  async function save() {
    if (!quoteRequestId) return
    if (!note.trim()) { toast.error('修正内容を入力してください'); return }
    setSaving(true)
    try {
      const form = new FormData()
      form.append('note', note.trim())
      if (file) form.append('file', file)
      const r = (await postForm(`/api/sfa/quote-requests/${quoteRequestId}/revision`, form)) as { notified: boolean }
      toast.success(r.notified ? '修正依頼を見積書ルームに送りました' : '修正依頼を登録しました（Chatwork通知は未設定）')
      onOpenChange(false)
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '修正依頼に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>見積の修正依頼</DialogTitle>
          <DialogDescription>#Q-{quoteRequestId}。テンドールに見積書ルームで依頼します。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>修正内容 <span className="text-red-600">*</span></Label>
            <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: VK-62を対応品BF-361に差し替え、数量50ケースで" />
          </div>
          <div className="space-y-1">
            <Label>参考ファイル（任意・見積書としては取り込まれません）</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}依頼する</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 見積作成依頼 */
export function QuoteRequestDialog({ dealId, open, onOpenChange, onSaved }: {
  dealId: number; open: boolean; onOpenChange: (o: boolean) => void; onSaved?: () => void
}) {
  const [note, setNote] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setNote(''); setDueOn('') } }, [open])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/sfa/deals/${dealId}/quote-requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() || null, due_on: dueOn || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '依頼に失敗しました')
      toast.success(data.notified ? `見積作成を依頼しました（#Q-${data.quote_request_id}）` : `見積依頼を登録しました（#Q-${data.quote_request_id}・Chatwork通知は未設定）`)
      onOpenChange(false)
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '依頼に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>見積作成を依頼</DialogTitle>
          <DialogDescription>見積書ルームに依頼が投稿されます。使用中容器の記録も一緒に送られます。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>依頼内容</Label>
            <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="対象容器・数量・配送条件など" />
          </div>
          <div className="space-y-1">
            <Label>回答希望日（任意）</Label>
            <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}依頼する</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
