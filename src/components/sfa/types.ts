// SFA画面で使う型（APIレスポンスの形。src/lib/sfa/service.ts と一致させる）
import type { ActivityKind, QuoteStatus, Stage, TaskKind, Temperature } from '@/lib/sfa/constants'

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

export interface MemberOption {
  id: number
  name: string
  tenant_name?: string
}

export interface Me {
  id: number
  name: string
  role: 'admin' | 'sales'
  tenant_id: string
  is_quote_maker: boolean
}

export interface Company {
  id: number
  name: string
  phone: string | null
  address: string | null
  industry: string | null
  website: string | null
  bcart_customer_id: string | null
  memo: string | null
}

export interface Contact {
  id: number
  company_id: number
  name: string | null
  position: string | null
  phone: string | null
  mobile: string | null
  email: string | null
  best_time: string | null
  memo: string | null
}

export interface Activity {
  id: number
  occurred_on: string | null
  occurred_at: string | null
  kind: ActivityKind
  body: string | null
  source: string
  member: { id: number; name: string } | null
}

export interface Task {
  id: number
  due_on: string
  due_time: string | null
  kind: TaskKind
  note: string | null
  done_at: string | null
  assignee: { id: number; name: string } | null
}

export interface Container {
  id: number
  product: string
  maker: string | null
  supplier: string | null
  unit_price: number | null
  price_note: string | null
  monthly_qty: string | null
  cost_master_code: string | null
  memo: string | null
}

export interface QuoteFile {
  id: number
  version: number
  file_name: string
  note: string | null
  source: string
  uploaded_at: string
  size_bytes: number | null
}

export interface QuoteRequest {
  id: number
  status: QuoteStatus
  request_note: string | null
  due_on: string | null
  requested_at: string
  requested_by: { id: number; name: string } | null
  files: QuoteFile[]
}

export interface DealDetail {
  id: number
  company_id: number
  stage: Stage
  temperature: Temperature | null
  owner_id: number | null
  tossed_by_id: number | null
  tossed_by_name: string | null
  tossed_at: string | null
  appointment_note: string | null
  hearing: string | null
  current_containers_text: string | null
  considering: string | null
  answer_due: string | null
  lost_reason: string | null
  legacy: Record<string, string> | null
  company: Company
  contact: Contact | null
  owner: { id: number; name: string } | null
  tossed_by: { id: number; name: string } | null
  contacts: Contact[]
  activities: Activity[]
  tasks: Task[]
  containers: Container[]
  quote_requests: QuoteRequest[]
}

export interface InboxCandidate {
  quote_request_id: number
  deal_id: number
  company_name: string
  score: number
}

export interface InboxItem {
  id: number
  file_name: string | null
  account_name: string | null
  reason: string | null
  confidence: number | null
  decision: string
  candidates: InboxCandidate[] | null
  created_at: string
}
