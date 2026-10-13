'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  CLOSED_STAGES, STAGES, TASK_KINDS, TEMPERATURES,
  type ActivityKind, type Stage, type TaskKind, type Temperature,
} from '@/lib/sfa/constants'
import { cn } from '@/lib/utils'
import { api, DATE_PRESETS, selectClass, todayJst } from './utils'

const KIND_PRESETS: ActivityKind[] = ['不在', '架電', '見積提示', '商談', '訪問', 'メール', 'SMS', 'メモ']

export interface LogTarget {
  id: number
  company_name: string
  stage: Stage
  temperature?: Temperature | null
}

export function LogContactDialog({
  target, open, onOpenChange, onSaved,
}: {
  target: LogTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}) {
  const today = todayJst()
  const [kind, setKind] = useState<ActivityKind>('架電')
  const [body, setBody] = useState('')
  const [occurredOn, setOccurredOn] = useState(today)
  const [stage, setStage] = useState<Stage | ''>('')
  const [temperature, setTemperature] = useState<Temperature | ''>('')
  const [considering, setConsidering] = useState('')
  const [lostReason, setLostReason] = useState('')
  const [nextDue, setNextDue] = useState('')
  const [nextKind, setNextKind] = useState<TaskKind | ''>('')
  const [nextNote, setNextNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setKind('架電'); setBody(''); setOccurredOn(todayJst()); setStage(''); setTemperature(target?.temperature ?? '')
    setConsidering(''); setLostReason(''); setNextDue(''); setNextKind(''); setNextNote('')
  }, [open, target])

  function pickKind(k: ActivityKind) {
    setKind(k)
    if (k === '見積提示') {
      setStage('検討中')
      setNextKind('回答確認')
    } else if (k === '不在') {
      setNextKind('再架電')
      if (!body) setBody('不在')
    }
  }

  const finalStage = (stage || target?.stage) as Stage | undefined
  const closing = !!finalStage && CLOSED_STAGES.includes(finalStage)
  const answerMode = kind === '見積提示' || nextKind === '回答確認'

  async function save() {
    if (!target) return
    if (!body.trim()) { toast.error('内容を入力してください'); return }
    if (!closing && !nextDue) { toast.error('次のアクションの日付を指定してください（進行中の案件は必須）'); return }
    setSaving(true)
    try {
      await api(`/api/sfa/deals/${target.id}/activities`, {
        method: 'POST',
        json: {
          kind, body: body.trim(), occurred_on: occurredOn || null,
          ...(stage ? { stage } : {}),
          ...(temperature && temperature !== target.temperature ? { temperature } : {}),
          ...(considering.trim() ? { considering: considering.trim() } : {}),
          ...(stage === '失注' && lostReason.trim() ? { lost_reason: lostReason.trim() } : {}),
          next: !closing && nextDue ? { due_on: nextDue, ...(nextKind ? { kind: nextKind } : {}), note: nextNote.trim() || null } : null,
        },
      })
      toast.success('記録しました')
      onOpenChange(false)
      onSaved?.()
    } catch {
      // api() がトースト済み
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>結果を記録</DialogTitle>
          <DialogDescription>{target?.company_name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {KIND_PRESETS.map((k) => (
              <Button key={k} type="button" size="sm" variant={kind === k ? 'default' : 'outline'} onClick={() => pickKind(k)}>
                {k}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <Label>内容</Label>
              <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="話した内容・先方の反応など" />
            </div>
            <div className="space-y-1">
              <Label>接触日</Label>
              <Input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>段階（変える場合）</Label>
              <select className={selectClass} value={stage} onChange={(e) => setStage(e.target.value as Stage | '')}>
                <option value="">変更しない（{target?.stage}）</option>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>温度感</Label>
              <select className={selectClass} value={temperature} onChange={(e) => setTemperature(e.target.value as Temperature | '')}>
                <option value="">—</option>
                {TEMPERATURES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {(finalStage === '検討中' || answerMode) && (
            <div className="space-y-1">
              <Label>何を検討しているか</Label>
              <Input value={considering} onChange={(e) => setConsidering(e.target.value)} placeholder="例: 現在の仕入れ値と比較してから判断" />
            </div>
          )}
          {stage === '失注' && (
            <div className="space-y-1">
              <Label>失注理由</Label>
              <Input value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
            </div>
          )}

          {!closing && (
            <div className="space-y-2 rounded-lg border p-3">
              <Label>{answerMode ? '回答予定日（次のアクション）' : '次のアクション'} <span className="text-red-600">*</span></Label>
              <div className="flex flex-wrap gap-1">
                {DATE_PRESETS.map((p) => {
                  const v = p.calc(today)
                  return (
                    <Button key={p.label} type="button" size="xs" variant={nextDue === v ? 'default' : 'outline'} onClick={() => setNextDue(v)}>
                      {p.label}
                    </Button>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} className={cn(!nextDue && 'border-red-300')} />
                <select className={selectClass} value={nextKind} onChange={(e) => setNextKind(e.target.value as TaskKind | '')}>
                  <option value="">種類（自動）</option>
                  {TASK_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <Input value={nextNote} onChange={(e) => setNextNote(e.target.value)} placeholder="メモ（例: 16時以降に店舗へ）" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}記録する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
