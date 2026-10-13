/**
 * SFAサービス層
 * 管理画面API・MCP・Chatwork取込はすべてここを経由する（ロジックの二重実装禁止）。
 * DBアクセスはservice role（RLSポリシーなし）。権限チェックは呼び出し側で SfaMember を確定させてから行う。
 */
import { v4 as uuidv4 } from 'uuid'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPresignedUrl, putObject } from '@/lib/s3'
import type { SfaMember } from './member'
import {
  CLOSED_STAGES, OPEN_STAGES, QUOTE_FILE_PREFIX, QUOTE_WAITING_STATUSES, SFA_OWNER_TENANT_NAME, todayJst,
  type ActivityKind, type QuoteStatus, type Stage, type TaskKind, type Temperature,
} from './constants'
import { notifyQuoteReady, notifyQuoteRequest, notifyRevisionRequest } from './notify'

export class SfaError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const db = () => createAdminClient()

/** Supabaseの結果を検査して data を返す。行の型は呼び出し側で as で付ける（埋め込みselectの推論は当てにならないため） */
function must(res: { data: unknown; error: { message: string } | null }, what = '処理'): unknown {
  if (res.error) throw new SfaError(`${what}に失敗しました: ${res.error.message}`, 500)
  return res.data
}

let ownerTenantCache: string | null = null
export async function ownerTenantId(): Promise<string> {
  if (ownerTenantCache) return ownerTenantCache
  const row = must(await db().from('tenants').select('id').eq('name', SFA_OWNER_TENANT_NAME).single(), 'テナント取得')
  ownerTenantCache = (row as { id: string }).id
  return ownerTenantCache
}

/** 見積書を作る側（案件の持ち主テナント）に所属しているか */
export async function isQuoteMaker(m: Pick<SfaMember, 'tenant_id'>): Promise<boolean> {
  return m.tenant_id === (await ownerTenantId())
}

const digits = (s?: string | null) => (s || '').replace(/[^0-9]/g, '')

// =============================================================
// 型
// =============================================================
export interface DealOverview {
  id: number
  company_id: number
  company_name: string
  phone: string | null
  stage: Stage
  temperature: Temperature | null
  owner_id: number | null
  owner_name: string | null
  tossed_at: string | null
  tossed_by_name: string | null
  considering: string | null
  answer_due: string | null
  updated_at: string
  contact_name: string | null
  contact_mobile: string | null
  best_time: string | null
  next_task_id: number | null
  next_due_on: string | null
  next_kind: TaskKind | null
  next_note: string | null
  last_contact_on: string | null
  last_contact_body: string | null
  is_open: boolean
}

export interface NextActionInput {
  due_on: string
  kind?: TaskKind
  note?: string | null
  due_time?: string | null
}

// =============================================================
// 一覧・ボード
// =============================================================
export async function listDeals(opts: {
  q?: string
  stage?: Stage | Stage[]
  ownerId?: number
  open?: boolean
  limit?: number
} = {}): Promise<DealOverview[]> {
  let query = db().from('sfa_deal_overview').select('*').eq('tenant_id', await ownerTenantId())
  if (opts.open !== undefined) query = query.eq('is_open', opts.open)
  if (opts.stage) query = Array.isArray(opts.stage) ? query.in('stage', opts.stage) : query.eq('stage', opts.stage)
  if (opts.ownerId) query = query.eq('owner_id', opts.ownerId)
  if (opts.q?.trim()) {
    const q = opts.q.trim().replace(/[,()]/g, ' ')
    const tel = digits(q)
    query = tel.length >= 4
      ? query.or(`company_name.ilike.%${q}%,phone.ilike.%${tel.slice(-4)}%,contact_mobile.ilike.%${tel.slice(-4)}%`)
      : query.or(`company_name.ilike.%${q}%,contact_name.ilike.%${q}%`)
  }
  const rows = must(await query.order('next_due_on', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false }).limit(opts.limit ?? 500), '案件一覧')
  return rows as DealOverview[]
}

export interface TodayBoard {
  today: string
  overdue: DealOverview[]
  due_today: DealOverview[]
  upcoming: DealOverview[]
  no_next: DealOverview[]
  answer_waiting: DealOverview[]
  quote_queue: QuoteQueueItem[]
  counts: Record<string, number>
}

/** 今日やること: 期限切れ / 今日 / 7日以内 / 次回未設定 / 回答待ち / 見積作成待ち */
export async function getTodayBoard(opts: { ownerId?: number } = {}): Promise<TodayBoard> {
  const today = todayJst()
  const in7 = new Date(Date.parse(today) + 7 * 86400_000).toISOString().slice(0, 10)
  const open = await listDeals({ open: true, ownerId: opts.ownerId })
  const overdue = open.filter((d) => d.next_due_on && d.next_due_on < today)
  const due_today = open.filter((d) => d.next_due_on === today)
  const upcoming = open.filter((d) => d.next_due_on && d.next_due_on > today && d.next_due_on <= in7)
  const no_next = open.filter((d) => !d.next_due_on)
  const answer_waiting = open
    .filter((d) => d.stage === '検討中')
    .sort((a, b) => (a.answer_due || a.next_due_on || '9999').localeCompare(b.answer_due || b.next_due_on || '9999'))
  const quote_queue = await listQuoteQueue()
  const counts: Record<string, number> = { open: open.length }
  for (const s of OPEN_STAGES) counts[s] = open.filter((d) => d.stage === s).length
  return { today, overdue, due_today, upcoming, no_next, answer_waiting, quote_queue, counts }
}

export async function pipelineSummary() {
  const tenant = await ownerTenantId()
  const rows = must(await db().from('sfa_deals').select('stage, owner_id, tossed_at, closed_at').eq('tenant_id', tenant), '集計') as
    Array<{ stage: Stage; owner_id: number | null; tossed_at: string | null; closed_at: string | null }>
  const members = await listMembers()
  const name = (id: number | null) => members.find((m) => m.id === id)?.name ?? '未割当'
  const byStage: Record<string, number> = {}
  const byOwner: Record<string, Record<string, number>> = {}
  const byMonth: Record<string, Record<string, number>> = {}
  for (const r of rows) {
    byStage[r.stage] = (byStage[r.stage] || 0) + 1
    const o = name(r.owner_id)
    byOwner[o] = byOwner[o] || {}
    byOwner[o][r.stage] = (byOwner[o][r.stage] || 0) + 1
    const mo = (r.tossed_at || '').slice(0, 7) || '不明'
    byMonth[mo] = byMonth[mo] || { アポ: 0 }
    byMonth[mo]['アポ']++
    byMonth[mo][r.stage] = (byMonth[mo][r.stage] || 0) + 1
  }
  const won = (byStage['受注'] || 0) + (byStage['会員登録'] || 0)
  return {
    total: rows.length,
    by_stage: byStage,
    by_owner: byOwner,
    by_toss_month: byMonth,
    conversion: { won_or_registered: won, rate: rows.length ? Math.round((won / rows.length) * 1000) / 10 : 0 },
  }
}

// =============================================================
// 案件詳細
// =============================================================
export async function getDeal(id: number) {
  const tenant = await ownerTenantId()
  const deal = must(await db().from('sfa_deals')
    .select(`*, company:sfa_companies(*), contact:sfa_contacts!sfa_deals_contact_id_fkey(*),
      owner:sfa_members!sfa_deals_owner_id_fkey(id, name), tossed_by:sfa_members!sfa_deals_tossed_by_id_fkey(id, name)`)
    .eq('id', id).eq('tenant_id', tenant).maybeSingle(), '案件取得')
  if (!deal) throw new SfaError('案件が見つかりません', 404)
  const d = deal as { company_id: number } & Record<string, unknown>

  const [contacts, activities, tasks, containers, quotes] = await Promise.all([
    db().from('sfa_contacts').select('*').eq('company_id', d.company_id).order('id'),
    db().from('sfa_activities').select('*, member:sfa_members(id, name)').eq('deal_id', id)
      .order('occurred_on', { ascending: false, nullsFirst: false }).order('seq', { ascending: false }).order('id', { ascending: false }),
    db().from('sfa_tasks').select('*, assignee:sfa_members!sfa_tasks_assignee_id_fkey(id, name)').eq('deal_id', id)
      .order('done_at', { ascending: false, nullsFirst: true }).order('due_on'),
    db().from('sfa_deal_containers').select('*').eq('deal_id', id).order('id'),
    db().from('sfa_quote_requests').select('*, requested_by:sfa_members(id, name), files:sfa_quote_files(*)').eq('deal_id', id)
      .order('requested_at', { ascending: false }),
  ])
  return {
    ...d,
    contacts: must(contacts, '担当者取得'),
    activities: must(activities, '履歴取得'),
    tasks: must(tasks, 'タスク取得'),
    containers: must(containers, '容器取得'),
    quote_requests: (must(quotes, '見積取得') as Array<{ files: Array<{ version: number }> }>).map((q) => ({
      ...q,
      files: [...(q.files || [])].sort((a, b) => b.version - a.version),
    })),
  }
}

async function getDealRow(id: number) {
  const row = must(await db().from('sfa_deals').select('*').eq('id', id).eq('tenant_id', await ownerTenantId()).maybeSingle(), '案件取得')
  if (!row) throw new SfaError('案件が見つかりません', 404)
  return row as { id: number; company_id: number; stage: Stage; owner_id: number | null; answer_due: string | null }
}

async function addActivity(dealId: number, member: SfaMember | null, kind: ActivityKind, body: string,
  opts: { occurred_on?: string | null; source?: 'ui' | 'mcp' | 'import' | 'system' } = {}) {
  must(await db().from('sfa_activities').insert({
    deal_id: dealId, kind, body,
    occurred_on: opts.occurred_on === undefined ? todayJst() : opts.occurred_on,
    occurred_at: new Date().toISOString(),
    member_id: member?.id ?? null, source: opts.source ?? 'ui',
  }), '履歴登録')
}

async function completeOpenTasks(dealId: number, member: SfaMember | null, kinds?: TaskKind[]) {
  let q = db().from('sfa_tasks').update({ done_at: new Date().toISOString(), done_by_id: member?.id ?? null })
    .eq('deal_id', dealId).is('done_at', null)
  if (kinds) q = q.in('kind', kinds)
  must(await q, 'タスク完了')
}

async function addTask(dealId: number, next: NextActionInput, assigneeId: number | null, member: SfaMember | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next.due_on)) throw new SfaError('次回日付は YYYY-MM-DD で指定してください')
  must(await db().from('sfa_tasks').insert({
    deal_id: dealId, due_on: next.due_on, due_time: next.due_time || null, kind: next.kind || '再架電',
    note: next.note || null, assignee_id: assigneeId, created_by_id: member?.id ?? null,
  }), 'タスク登録')
}

/** 段階の変更（履歴・closed_at・タスク整理を伴う） */
async function changeStage(deal: { id: number; stage: Stage }, to: Stage, member: SfaMember | null, source: 'ui' | 'mcp' | 'system' = 'ui') {
  if (deal.stage === to) return
  const closed = CLOSED_STAGES.includes(to)
  must(await db().from('sfa_deals').update({
    stage: to, stage_changed_at: new Date().toISOString(), closed_at: closed ? new Date().toISOString() : null,
  }).eq('id', deal.id), '段階変更')
  await addActivity(deal.id, member, 'ステータス変更', `${deal.stage} → ${to}`, { source })
  if (closed) await completeOpenTasks(deal.id, member)
  deal.stage = to
}

// =============================================================
// アポ登録（＝データ登録の入口）
// =============================================================
export interface AppointmentInput {
  company: { name: string; phone?: string | null; address?: string | null; industry?: string | null; website?: string | null }
  contact?: { name?: string | null; position?: string | null; mobile?: string | null; email?: string | null; best_time?: string | null }
  temperature?: Temperature | null
  owner_id?: number | null
  tossed_by_id?: number | null
  tossed_at?: string | null
  appointment_note?: string | null
  hearing?: string | null
  current_containers_text?: string | null
  containers?: ContainerInput[]
  next: NextActionInput
  request_quote?: { note?: string | null; due_on?: string | null } | null
  force?: boolean
}

export async function findDuplicates(name: string, phone?: string | null): Promise<DealOverview[]> {
  const tel = digits(phone)
  const byName = await listDeals({ q: name, limit: 5 })
  const byTel = tel.length >= 9 ? (await listDeals({ q: tel, limit: 5 })).filter((d) => digits(d.phone).endsWith(tel.slice(-9)) || digits(d.contact_mobile).endsWith(tel.slice(-9))) : []
  const seen = new Set<number>()
  return [...byTel, ...byName.filter((d) => d.company_name.replace(/\s/g, '') === name.replace(/\s/g, ''))]
    .filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))
}

export async function createAppointment(member: SfaMember, input: AppointmentInput, source: 'ui' | 'mcp' = 'ui') {
  if (!input.company?.name?.trim()) throw new SfaError('会社名・店舗名は必須です')
  if (!input.next?.due_on) throw new SfaError('次のアクション（日付）は必須です')
  if (!input.force) {
    const dup = await findDuplicates(input.company.name, input.company.phone)
    if (dup.length) {
      throw Object.assign(new SfaError(`同じ店舗の案件が既にあります（${dup.map((d) => `#${d.id} ${d.company_name}[${d.stage}]`).join(', ')}）。別案件として登録する場合は force を指定してください`, 409), { duplicates: dup })
    }
  }
  const tenant = await ownerTenantId()
  const company = must(await db().from('sfa_companies').insert({ tenant_id: tenant, ...input.company, name: input.company.name.trim() })
    .select('id').single(), '会社登録') as { id: number }
  const contact = must(await db().from('sfa_contacts').insert({ company_id: company.id, ...(input.contact || {}) })
    .select('id').single(), '担当者登録') as { id: number }
  // アポ獲得者: 指定がなければ登録者（テンドール側が代理登録する場合は tossed_by_id を指定）
  const tossedBy = input.tossed_by_id ?? ((await isQuoteMaker(member)) ? null : member.id)
  const ownerId = input.owner_id ?? tossedBy ?? member.id
  const deal = must(await db().from('sfa_deals').insert({
    tenant_id: tenant, company_id: company.id, contact_id: contact.id, stage: 'アポ獲得',
    temperature: input.temperature || null, owner_id: ownerId, tossed_by_id: tossedBy,
    tossed_at: input.tossed_at || todayJst(), appointment_note: input.appointment_note || null,
    hearing: input.hearing || null, current_containers_text: input.current_containers_text || null,
    created_by_id: member.id,
  }).select('id, stage').single(), '案件登録') as { id: number; stage: Stage }

  await addActivity(deal.id, member, 'メモ', `アポ獲得（登録: ${member.name}）${input.appointment_note ? `\n希望日時: ${input.appointment_note}` : ''}`, { source })
  for (const c of input.containers || []) await addContainer(deal.id, c)
  await addTask(deal.id, input.next, ownerId, member)
  if (input.request_quote) await requestQuote(member, { deal_id: deal.id, ...input.request_quote }, source)
  return { deal_id: deal.id, company_id: company.id }
}

// =============================================================
// 接触の記録（架電結果など）＋次のアクション
// =============================================================
export interface LogContactInput {
  deal_id: number
  kind: ActivityKind
  body: string
  occurred_on?: string | null
  /** 次のアクション。進行中のまま終える場合は必須 */
  next?: NextActionInput | null
  stage?: Stage
  temperature?: Temperature | null
  considering?: string | null
  answer_due?: string | null
  lost_reason?: string | null
}

export async function logContact(member: SfaMember, input: LogContactInput, source: 'ui' | 'mcp' = 'ui') {
  const deal = await getDealRow(input.deal_id)
  if (!input.body?.trim()) throw new SfaError('内容を入力してください')

  // 見積提示 → 最新の見積を提示済にし、段階は検討中へ
  let stage = input.stage
  if (input.kind === '見積提示') {
    const latest = must(await db().from('sfa_quote_requests').select('id, status').eq('deal_id', deal.id)
      .in('status', ['作成済', '提示済']).order('requested_at', { ascending: false }).limit(1), '見積取得') as Array<{ id: number; status: QuoteStatus }>
    if (latest[0] && latest[0].status !== '提示済') {
      must(await db().from('sfa_quote_requests').update({ status: '提示済' }).eq('id', latest[0].id), '見積更新')
    }
    if (!stage && ['アポ獲得', '見積依頼', '見積作成済'].includes(deal.stage)) stage = '検討中'
  }
  const finalStage = stage ?? deal.stage
  const closing = CLOSED_STAGES.includes(finalStage)
  if (!closing && !input.next?.due_on) {
    throw new SfaError('次のアクションの日付を指定してください（進行中の案件は次回予定が必須です）')
  }

  await addActivity(deal.id, member, input.kind, input.body.trim(), { occurred_on: input.occurred_on ?? todayJst(), source })
  // 今回の接触で、既存の未完了タスク（再架電・回答確認・見積提示など）は完了扱い。見積作成タスクはテンドール側のため残す
  await completeOpenTasks(deal.id, member, ['再架電', '見積提示', '回答確認', '再アプローチ', '訪問', 'その他'])

  const patch: Record<string, unknown> = {}
  if (input.temperature !== undefined) patch.temperature = input.temperature
  if (input.considering !== undefined) patch.considering = input.considering
  if (input.lost_reason !== undefined) patch.lost_reason = input.lost_reason
  if (input.answer_due !== undefined) patch.answer_due = input.answer_due
  else if (finalStage === '検討中' && input.next?.due_on && (input.next.kind === '回答確認' || input.kind === '見積提示')) {
    patch.answer_due = input.next.due_on
  }
  if (Object.keys(patch).length) must(await db().from('sfa_deals').update(patch).eq('id', deal.id), '案件更新')
  if (stage) await changeStage(deal, stage, member, source)
  if (!closing && input.next) {
    const kind = input.next.kind || (finalStage === '検討中' ? '回答確認' : '再架電')
    await addTask(deal.id, { ...input.next, kind }, deal.owner_id ?? member.id, member)
  }
  return { deal_id: deal.id, stage: finalStage }
}

// =============================================================
// 案件・会社・担当者の更新
// =============================================================
export interface DealPatch {
  stage?: Stage
  temperature?: Temperature | null
  owner_id?: number | null
  tossed_by_id?: number | null
  title?: string | null
  hearing?: string | null
  current_containers_text?: string | null
  considering?: string | null
  answer_due?: string | null
  lost_reason?: string | null
  appointment_note?: string | null
}

export async function updateDeal(member: SfaMember, id: number, patch: DealPatch, source: 'ui' | 'mcp' = 'ui') {
  const deal = await getDealRow(id)
  const { stage, ...rest } = patch
  const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) must(await db().from('sfa_deals').update(clean).eq('id', id), '案件更新')
  if (stage) await changeStage(deal, stage, member, source)
  return { deal_id: id }
}

export async function updateCompany(id: number, patch: Partial<{ name: string; phone: string | null; address: string | null; industry: string | null; website: string | null; bcart_customer_id: string | null; memo: string | null }>) {
  must(await db().from('sfa_companies').update(patch).eq('id', id).eq('tenant_id', await ownerTenantId()), '会社更新')
}

/** 担当者の更新・追加。dealId を渡すと、案件に担当者が未設定のとき新しい担当者を案件の担当者にする */
export async function upsertContact(companyId: number, contact: { id?: number; name?: string | null; position?: string | null; phone?: string | null; mobile?: string | null; email?: string | null; best_time?: string | null; memo?: string | null }, dealId?: number) {
  const { id, ...rest } = contact
  if (id) {
    must(await db().from('sfa_contacts').update(rest).eq('id', id).eq('company_id', companyId), '担当者更新')
    return id
  }
  const row = must(await db().from('sfa_contacts').insert({ company_id: companyId, ...rest }).select('id').single(), '担当者登録') as { id: number }
  if (dealId) must(await db().from('sfa_deals').update({ contact_id: row.id }).eq('id', dealId).is('contact_id', null), '案件の担当者設定')
  return row.id
}

/** 見積書を登録できるのは、見積作成側（テンドール）のメンバーか管理者だけ（外部営業は不可） */
export async function assertCanUploadQuote(m: SfaMember) {
  if (m.role !== 'admin' && !(await isQuoteMaker(m))) throw new SfaError('見積書を登録できるのはテンドールまたは管理者のみです', 403)
}

// =============================================================
// タスク
// =============================================================
export async function rescheduleTask(member: SfaMember, taskId: number, next: Partial<NextActionInput>) {
  const patch: Record<string, unknown> = {}
  if (next.due_on) patch.due_on = next.due_on
  if (next.kind) patch.kind = next.kind
  if (next.note !== undefined) patch.note = next.note
  if (next.due_time !== undefined) patch.due_time = next.due_time
  must(await db().from('sfa_tasks').update(patch).eq('id', taskId).is('done_at', null), 'タスク更新')
}

export async function createTask(member: SfaMember, dealId: number, next: NextActionInput, assigneeId?: number | null) {
  const deal = await getDealRow(dealId)
  await addTask(dealId, next, assigneeId ?? deal.owner_id ?? member.id, member)
}

export async function completeTask(member: SfaMember, taskId: number) {
  must(await db().from('sfa_tasks').update({ done_at: new Date().toISOString(), done_by_id: member.id }).eq('id', taskId).is('done_at', null), 'タスク完了')
}

// =============================================================
// 使用中容器
// =============================================================
export interface ContainerInput {
  product: string
  maker?: string | null
  supplier?: string | null
  unit_price?: number | null
  price_note?: string | null
  monthly_qty?: string | null
  cost_master_code?: string | null
  memo?: string | null
}

export async function addContainer(dealId: number, c: ContainerInput) {
  if (!c.product?.trim()) throw new SfaError('品名・型番は必須です')
  const row = must(await db().from('sfa_deal_containers').insert({ deal_id: dealId, ...c, product: c.product.trim() }).select('id').single(), '容器登録')
  return row as { id: number }
}

export async function updateContainer(id: number, c: Partial<ContainerInput>) {
  must(await db().from('sfa_deal_containers').update(c).eq('id', id), '容器更新')
}

export async function deleteContainer(id: number) {
  must(await db().from('sfa_deal_containers').delete().eq('id', id), '容器削除')
}

// =============================================================
// 見積依頼・修正依頼・見積書
// =============================================================
export interface QuoteQueueItem {
  id: number
  deal_id: number
  status: QuoteStatus
  request_note: string | null
  due_on: string | null
  requested_at: string
  company_name: string
  owner_name: string | null
  latest_version: number | null
}

/** テンドールが見積を作るべき依頼（依頼中・作成中・修正依頼） */
export async function listQuoteQueue(): Promise<QuoteQueueItem[]> {
  const rows = must(await db().from('sfa_quote_requests')
    .select('id, deal_id, status, request_note, due_on, requested_at, files:sfa_quote_files(version), deal:sfa_deals!inner(tenant_id, company:sfa_companies(name), owner:sfa_members!sfa_deals_owner_id_fkey(name))')
    .in('status', QUOTE_WAITING_STATUSES).eq('deal.tenant_id', await ownerTenantId())
    .order('requested_at'), '見積待ち取得') as Array<{
      id: number; deal_id: number; status: QuoteStatus; request_note: string | null; due_on: string | null; requested_at: string
      files: Array<{ version: number }>; deal: { company: { name: string } | null; owner: { name: string } | null }
    }>
  return rows.map((r) => ({
    id: r.id, deal_id: r.deal_id, status: r.status, request_note: r.request_note, due_on: r.due_on, requested_at: r.requested_at,
    company_name: r.deal.company?.name ?? '', owner_name: r.deal.owner?.name ?? null,
    latest_version: r.files.length ? Math.max(...r.files.map((f) => f.version)) : null,
  }))
}

async function quoteContext(quoteRequestId: number) {
  const row = must(await db().from('sfa_quote_requests')
    .select('*, deal:sfa_deals!inner(id, stage, owner_id, tenant_id, current_containers_text, company:sfa_companies(name), owner:sfa_members!sfa_deals_owner_id_fkey(id, name, chatwork_account_id, chatwork_room_id))')
    .eq('id', quoteRequestId).eq('deal.tenant_id', await ownerTenantId()).maybeSingle(), '見積依頼取得')
  if (!row) throw new SfaError('見積依頼が見つかりません', 404)
  return row as {
    id: number; deal_id: number; status: QuoteStatus; request_note: string | null; due_on: string | null; chatwork_message_id: string | null
    deal: {
      id: number; stage: Stage; owner_id: number | null; current_containers_text: string | null
      company: { name: string } | null
      owner: { id: number; name: string; chatwork_account_id: string | null; chatwork_room_id: string | null } | null
    }
  }
}

export async function requestQuote(member: SfaMember, input: { deal_id: number; note?: string | null; due_on?: string | null }, source: 'ui' | 'mcp' = 'ui') {
  const deal = await getDealRow(input.deal_id)
  const req = must(await db().from('sfa_quote_requests').insert({
    deal_id: deal.id, status: '依頼中', request_note: input.note || null, due_on: input.due_on || null, requested_by_id: member.id,
  }).select('id').single(), '見積依頼') as { id: number }
  if (['アポ獲得', '検討中', '長期検討'].includes(deal.stage)) await changeStage(deal, '見積依頼', member, source)
  await addActivity(deal.id, member, 'メモ', `見積作成を依頼（#Q-${req.id}）${input.note ? `\n${input.note}` : ''}`, { source })
  const ctx = await quoteContext(req.id)
  const messageId = await notifyQuoteRequest(ctx, member).catch((e) => { console.error('[sfa] 見積依頼の通知に失敗', e); return null })
  if (messageId) await db().from('sfa_quote_requests').update({ chatwork_message_id: messageId }).eq('id', req.id)
  return { quote_request_id: req.id, notified: !!messageId }
}

export async function requestRevision(member: SfaMember, input: {
  quote_request_id: number; note: string; attachment?: { buffer: Buffer; file_name: string; mime_type: string } | null
}, source: 'ui' | 'mcp' = 'ui') {
  if (!input.note?.trim()) throw new SfaError('修正内容を入力してください')
  const ctx = await quoteContext(input.quote_request_id)
  if (ctx.status === '取消') throw new SfaError('取り消された見積依頼です')
  must(await db().from('sfa_quote_requests').update({ status: '修正依頼', request_note: [ctx.request_note, `【修正依頼】${input.note.trim()}`].filter(Boolean).join('\n') })
    .eq('id', ctx.id), '修正依頼')
  const deal = { id: ctx.deal.id, stage: ctx.deal.stage }
  if (deal.stage !== '見積依頼' && !CLOSED_STAGES.includes(deal.stage)) await changeStage(deal, '見積依頼', member, source)
  await addActivity(ctx.deal_id, member, 'メモ', `見積の修正を依頼（#Q-${ctx.id}）\n${input.note.trim()}`, { source })
  const sent = await notifyRevisionRequest(ctx, member, input.note.trim(), input.attachment ?? null)
    .catch((e) => { console.error('[sfa] 修正依頼の通知に失敗', e); return null })
  return { quote_request_id: ctx.id, notified: !!sent }
}

export async function cancelQuoteRequest(member: SfaMember, quoteRequestId: number) {
  const ctx = await quoteContext(quoteRequestId)
  must(await db().from('sfa_quote_requests').update({ status: '取消' }).eq('id', ctx.id), '見積取消')
  await addActivity(ctx.deal_id, member, 'メモ', `見積依頼を取り消し（#Q-${ctx.id}）`)
}

/** 見積依頼が無い案件に見積書が届いた場合に、依頼を自動で作る */
export async function ensureQuoteRequest(dealId: number, note = '見積書受領時に自動作成'): Promise<number> {
  const open = must(await db().from('sfa_quote_requests').select('id').eq('deal_id', dealId)
    .in('status', QUOTE_WAITING_STATUSES).order('requested_at', { ascending: false }).limit(1), '見積依頼取得') as Array<{ id: number }>
  if (open[0]) return open[0].id
  const row = must(await db().from('sfa_quote_requests').insert({ deal_id: dealId, status: '依頼中', request_note: note }).select('id').single(), '見積依頼作成') as { id: number }
  return row.id
}

/**
 * 見積書の保存（画面アップロード・MCP・Chatwork取込の共通処理）
 *   版は自動採番。依頼は作成済、案件は見積作成済へ進め、対応担当に「見積提示」タスクと通知を出す
 */
export async function addQuoteFile(uploader: SfaMember | null, input: {
  quote_request_id: number
  buffer: Buffer
  file_name: string
  mime_type?: string | null
  note?: string | null
  source: 'ui' | 'mcp' | 'chatwork'
  chatwork_file_id?: string | null
}) {
  const ctx = await quoteContext(input.quote_request_id)
  if (input.buffer.length > 20 * 1024 * 1024) throw new SfaError('ファイルが大きすぎます（20MBまで）')
  const last = must(await db().from('sfa_quote_files').select('version').eq('quote_request_id', ctx.id)
    .order('version', { ascending: false }).limit(1), '版取得') as Array<{ version: number }>
  const version = (last[0]?.version ?? 0) + 1
  const ext = (input.file_name.match(/\.([a-zA-Z0-9]{1,5})$/)?.[1] || 'pdf').toLowerCase()
  const key = `${QUOTE_FILE_PREFIX}/${ctx.deal_id}/${uuidv4()}.${ext}`
  const mime = input.mime_type || (ext === 'pdf' ? 'application/pdf' : 'application/octet-stream')
  await putObject(key, input.buffer, mime)
  const file = must(await db().from('sfa_quote_files').insert({
    quote_request_id: ctx.id, version, storage_key: key, file_name: input.file_name, mime_type: mime,
    size_bytes: input.buffer.length, note: input.note || null, uploaded_by_id: uploader?.id ?? null,
    source: input.source, chatwork_file_id: input.chatwork_file_id || null,
  }).select('id').single(), '見積書登録') as { id: number }

  must(await db().from('sfa_quote_requests').update({ status: '作成済' }).eq('id', ctx.id), '見積依頼更新')
  const deal = { id: ctx.deal.id, stage: ctx.deal.stage }
  if (['アポ獲得', '見積依頼'].includes(deal.stage)) await changeStage(deal, '見積作成済', uploader, 'system')
  await completeOpenTasks(deal.id, uploader, ['見積作成'])
  const openPresent = must(await db().from('sfa_tasks').select('id').eq('deal_id', deal.id).eq('kind', '見積提示').is('done_at', null).limit(1), 'タスク取得') as unknown[]
  if (!openPresent.length) {
    await addTask(deal.id, { due_on: todayJst(), kind: '見積提示', note: `見積書 第${version}版を提示` }, ctx.deal.owner_id, uploader)
  }
  await addActivity(deal.id, uploader, 'メモ', `見積書 第${version}版を受領（#Q-${ctx.id}・${input.source === 'chatwork' ? 'Chatwork' : input.source === 'mcp' ? 'MCP' : '管理画面'}）${input.note ? `\n${input.note}` : ''}`, { source: 'system' })
  await notifyQuoteReady(ctx, version).catch((e) => console.error('[sfa] 見積受領の通知に失敗', e))
  return { quote_file_id: file.id, version, deal_id: deal.id }
}

/** 見積書のダウンロードURL（署名付き・10分） */
export async function quoteFileUrl(fileId: number): Promise<{ url: string; file_name: string }> {
  const row = must(await db().from('sfa_quote_files')
    .select('storage_key, file_name, req:sfa_quote_requests!inner(deal:sfa_deals!inner(tenant_id))')
    .eq('id', fileId).eq('req.deal.tenant_id', await ownerTenantId()).maybeSingle(), '見積書取得') as { storage_key: string; file_name: string } | null
  if (!row) throw new SfaError('見積書が見つかりません', 404)
  return { url: await getPresignedUrl(row.storage_key, 600), file_name: row.file_name }
}

// =============================================================
// メンバー
// =============================================================
export async function listMembers(): Promise<Array<SfaMember & { tenant_name?: string; has_mcp_key?: boolean }>> {
  const rows = must(await db().from('sfa_members')
    .select('id, name, tenant_id, role, email, auth_user_id, chatwork_account_id, chatwork_room_id, active, mcp_key_hash, tenant:tenants(name)')
    .order('id'), 'メンバー取得') as Array<SfaMember & { mcp_key_hash: string | null; tenant: { name: string } | null }>
  return rows.map(({ mcp_key_hash, tenant, ...m }) => ({ ...m, tenant_name: tenant?.name, has_mcp_key: !!mcp_key_hash }))
}

export async function upsertMember(input: {
  id?: number; name: string; tenant_id: string; role: 'admin' | 'sales'; email?: string | null
  chatwork_account_id?: string | null; chatwork_room_id?: string | null; active?: boolean
}) {
  const { id, ...rest } = input
  const row = id
    ? must(await db().from('sfa_members').update(rest).eq('id', id).select('id, auth_user_id, role').single(), 'メンバー更新')
    : must(await db().from('sfa_members').insert(rest).select('id, auth_user_id, role').single(), 'メンバー登録')
  return row as { id: number; auth_user_id: string | null; role: 'admin' | 'sales' }
}

export async function listTenants() {
  return must(await db().from('tenants').select('id, name').in('name', [SFA_OWNER_TENANT_NAME, '株式会社meguli']), 'テナント取得') as Array<{ id: string; name: string }>
}
