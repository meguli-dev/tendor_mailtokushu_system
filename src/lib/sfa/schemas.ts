/** SFAの入力スキーマ（APIルートとMCPで共用） */
import { z } from 'zod'
import { ACTIVITY_KINDS, STAGES, TASK_KINDS, TEMPERATURES } from './constants'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD で指定してください')
const optText = z.string().trim().max(5000).nullish()

export const nextActionSchema = z.object({
  due_on: date,
  kind: z.enum(TASK_KINDS).optional(),
  note: optText,
  due_time: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
})

export const containerSchema = z.object({
  product: z.string().trim().min(1, '品名・型番は必須です').max(200),
  maker: optText,
  supplier: optText,
  unit_price: z.number().nonnegative().nullish(),
  price_note: optText,
  monthly_qty: optText,
  cost_master_code: optText,
  memo: optText,
})

export const appointmentSchema = z.object({
  company: z.object({
    name: z.string().trim().min(1, '会社名・店舗名は必須です').max(200),
    phone: optText, address: optText, industry: optText, website: optText,
  }),
  contact: z.object({
    name: optText, position: optText, mobile: optText, email: optText, best_time: optText,
  }).optional(),
  temperature: z.enum(TEMPERATURES).nullish(),
  owner_id: z.number().int().nullish(),
  tossed_by_id: z.number().int().nullish(),
  tossed_at: date.nullish(),
  appointment_note: optText,
  hearing: optText,
  current_containers_text: optText,
  containers: z.array(containerSchema).max(30).optional(),
  next: nextActionSchema,
  request_quote: z.object({ note: optText, due_on: date.nullish() }).nullish(),
  force: z.boolean().optional(),
})

export const logContactSchema = z.object({
  kind: z.enum(ACTIVITY_KINDS).refine((k) => k !== 'ステータス変更', '接触種別が不正です'),
  body: z.string().trim().min(1, '内容を入力してください').max(5000),
  occurred_on: date.nullish(),
  next: nextActionSchema.nullish(),
  stage: z.enum(STAGES).optional(),
  temperature: z.enum(TEMPERATURES).nullish(),
  considering: optText,
  answer_due: date.nullish(),
  lost_reason: optText,
})

export const dealPatchSchema = z.object({
  stage: z.enum(STAGES).optional(),
  temperature: z.enum(TEMPERATURES).nullish(),
  owner_id: z.number().int().nullish(),
  tossed_by_id: z.number().int().nullish(),
  title: optText,
  hearing: optText,
  current_containers_text: optText,
  considering: optText,
  answer_due: date.nullish(),
  lost_reason: optText,
  appointment_note: optText,
  company: z.object({
    name: z.string().trim().min(1).max(200).optional(),
    phone: optText, address: optText, industry: optText, website: optText, bcart_customer_id: optText, memo: optText,
  }).optional(),
  contact: z.object({
    id: z.number().int().optional(),
    name: optText, position: optText, phone: optText, mobile: optText, email: optText, best_time: optText, memo: optText,
  }).optional(),
})

export const quoteRequestSchema = z.object({
  note: optText,
  due_on: date.nullish(),
})

export const revisionSchema = z.object({
  note: z.string().trim().min(1, '修正内容を入力してください').max(5000),
})

export const taskSchema = z.object({
  action: z.enum(['create', 'reschedule', 'complete']),
  task_id: z.number().int().optional(),
  next: nextActionSchema.partial().optional(),
  assignee_id: z.number().int().nullish(),
})

export const memberSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1).max(50),
  tenant_id: z.string().uuid(),
  role: z.enum(['admin', 'sales']),
  email: z.string().trim().email().nullish().or(z.literal('').transform(() => null)),
  chatwork_account_id: optText,
  chatwork_room_id: optText,
  active: z.boolean().optional(),
})
