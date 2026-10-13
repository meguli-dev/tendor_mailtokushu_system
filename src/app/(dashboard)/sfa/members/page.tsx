'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, KeyRound, Loader2, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, selectClass } from '@/components/sfa/utils'

interface Member {
  id: number
  name: string
  tenant_id: string
  tenant_name?: string
  role: 'admin' | 'sales'
  email: string | null
  auth_user_id: string | null
  chatwork_account_id: string | null
  chatwork_room_id: string | null
  active: boolean
  has_mcp_key?: boolean
}

interface Form {
  id?: number
  name: string
  tenant_id: string
  role: 'admin' | 'sales'
  email: string
  chatwork_account_id: string
  chatwork_room_id: string
  active: boolean
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [tenants, setTenants] = useState<Array<{ id: string; name: string }> | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [issued, setIssued] = useState<{ name: string; key: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await api<{ members: Member[]; tenants?: Array<{ id: string; name: string }> }>('/api/sfa/members')
      setMembers(d.members)
      setTenants(d.tenants ?? null)
    } catch {
      setMembers([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!form) return
    if (!form.name.trim() || !form.tenant_id) { toast.error('名前と所属は必須です'); return }
    setSaving(true)
    try {
      await api('/api/sfa/members', {
        method: 'POST',
        json: {
          ...(form.id ? { id: form.id } : {}),
          name: form.name.trim(), tenant_id: form.tenant_id, role: form.role,
          email: form.email.trim() || null,
          chatwork_account_id: form.chatwork_account_id.trim() || null,
          chatwork_room_id: form.chatwork_room_id.trim() || null,
          active: form.active,
        },
      })
      toast.success('保存しました')
      setForm(null)
      load()
    } catch { /* toast済み */ } finally {
      setSaving(false)
    }
  }

  async function issueKey(m: Member) {
    if (m.has_mcp_key && !confirm(`${m.name} のMCPキーを再発行しますか？（古いキーは使えなくなります）`)) return
    try {
      const r = await api<{ key: string }>(`/api/sfa/members/${m.id}/mcp-key`, { method: 'POST' })
      setIssued({ name: m.name, key: r.key })
      load()
    } catch { /* toast済み */ }
  }

  if (!members) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!tenants) return <p className="py-10 text-center text-sm text-muted-foreground">メンバー管理は管理者のみ利用できます</p>

  const endpoint = typeof window !== 'undefined' ? `${window.location.origin}/api/sfa/mcp/mcp` : '/api/sfa/mcp/mcp'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">メンバー</h1>
          <p className="text-sm text-muted-foreground">ログインはメールアドレスで自動的に紐付きます。外部営業（sales）はSFA以外の機能を使えません。</p>
        </div>
        <Button size="sm" onClick={() => setForm({ name: '', tenant_id: tenants[0]?.id ?? '', role: 'sales', email: '', chatwork_account_id: '', chatwork_room_id: '', active: true })}>
          <Plus className="h-3.5 w-3.5" />メンバー追加
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名前</TableHead>
              <TableHead>所属</TableHead>
              <TableHead>権限</TableHead>
              <TableHead>メール</TableHead>
              <TableHead>ログイン</TableHead>
              <TableHead>Chatwork</TableHead>
              <TableHead>MCPキー</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id} className={m.active ? '' : 'opacity-50'}>
                <TableCell className="font-medium">{m.name}{!m.active && '（無効）'}</TableCell>
                <TableCell className="text-xs">{m.tenant_name}</TableCell>
                <TableCell className="text-xs">{m.role === 'admin' ? '全機能' : 'SFAのみ'}</TableCell>
                <TableCell className="text-xs">{m.email}</TableCell>
                <TableCell className="text-xs">{m.auth_user_id ? '紐付け済' : <span className="text-muted-foreground">未</span>}</TableCell>
                <TableCell className="text-xs">
                  {m.chatwork_account_id ? `ID ${m.chatwork_account_id}` : <span className="text-muted-foreground">—</span>}
                  {m.chatwork_room_id && <div className="text-muted-foreground">room {m.chatwork_room_id}</div>}
                </TableCell>
                <TableCell className="text-xs">{m.has_mcp_key ? '発行済' : <span className="text-muted-foreground">未</span>}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="xs" variant="outline" onClick={() => setForm({
                      id: m.id, name: m.name, tenant_id: m.tenant_id, role: m.role, email: m.email ?? '',
                      chatwork_account_id: m.chatwork_account_id ?? '', chatwork_room_id: m.chatwork_room_id ?? '', active: m.active,
                    })}><Pencil className="h-3 w-3" />編集</Button>
                    <Button size="xs" variant="outline" onClick={() => issueKey(m)}><KeyRound className="h-3 w-3" />MCPキー{m.has_mcp_key ? '再発行' : '発行'}</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'メンバー編集' : 'メンバー追加'}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-3">
              <div className="space-y-1"><Label>名前 *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>所属 *</Label>
                  <select className={selectClass} value={form.tenant_id} onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}>
                    {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>権限</Label>
                  <select className={selectClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'sales' })}>
                    <option value="admin">全機能（admin）</option>
                    <option value="sales">SFAのみ（sales）</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1"><Label>ログインメール</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ポータルにログインする人のみ" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>Chatwork アカウントID</Label><Input value={form.chatwork_account_id} onChange={(e) => setForm({ ...form, chatwork_account_id: e.target.value })} /></div>
                <div className="space-y-1"><Label>通知ルームID</Label><Input value={form.chatwork_room_id} onChange={(e) => setForm({ ...form, chatwork_room_id: e.target.value })} placeholder="個別チャット" /></div>
              </div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />有効</label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>キャンセル</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issued} onOpenChange={(o) => { if (!o) setIssued(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{issued?.name} のMCPキー</DialogTitle>
            <DialogDescription>このキーは今だけ表示されます。Claudeのカスタムコネクタ等に設定してください。</DialogDescription>
          </DialogHeader>
          {issued && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <Label>エンドポイント</Label>
                <CopyLine value={endpoint} />
              </div>
              <div className="space-y-1">
                <Label>キー（Authorization: Bearer ...）</Label>
                <CopyLine value={issued.key} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIssued(null)}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CopyLine({ value }: { value: string }) {
  return (
    <div className="flex gap-1">
      <Input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
      <Button size="icon" variant="outline" onClick={async () => { await navigator.clipboard.writeText(value); toast.success('コピーしました') }}>
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  )
}
