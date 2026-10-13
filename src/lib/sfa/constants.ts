// SFAの区分値（DBのcheck制約と一致させること: supabase/migrations/*_sfa_schema.sql）

export const STAGES = ['アポ獲得', '見積依頼', '見積作成済', '検討中', '会員登録', '受注', '長期検討', '失注'] as const
export type Stage = (typeof STAGES)[number]

/** パイプラインに並べる進行中の段階 */
export const OPEN_STAGES: Stage[] = ['アポ獲得', '見積依頼', '見積作成済', '検討中', '会員登録', '長期検討']
export const CLOSED_STAGES: Stage[] = ['受注', '失注']

export const TEMPERATURES = ['高', '中', '低'] as const
export type Temperature = (typeof TEMPERATURES)[number]

export const ACTIVITY_KINDS = ['架電', '不在', '商談', '訪問', '見積提示', 'メール', 'SMS', 'ステータス変更', 'メモ'] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

/** 画面・MCPから記録できる接触種別（ステータス変更はシステムが自動で付ける） */
export const LOGGABLE_ACTIVITY_KINDS = ACTIVITY_KINDS.filter((k) => k !== 'ステータス変更')

export const TASK_KINDS = ['再架電', '見積作成', '見積提示', '回答確認', '再アプローチ', '訪問', 'その他'] as const
export type TaskKind = (typeof TASK_KINDS)[number]

export const QUOTE_STATUSES = ['依頼中', '作成中', '作成済', '修正依頼', '提示済', '取消'] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

/** テンドールが見積を作るべき（＝ルームから届くPDFの紐付け候補になる）状態 */
export const QUOTE_WAITING_STATUSES: QuoteStatus[] = ['依頼中', '作成中', '修正依頼']

export const STAGE_STYLE: Record<Stage, string> = {
  'アポ獲得': 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  '見積依頼': 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  '見積作成済': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  '検討中': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  '会員登録': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  '受注': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  '長期検討': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  '失注': 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
}

/** 案件の持ち主テナント（SCOSの tenants.name） */
export const SFA_OWNER_TENANT_NAME = 'テンドール物流株式会社'

/** 見積書の保存先プレフィックス（R2）。キーにはUUIDを含め推測不能にする */
export const QUOTE_FILE_PREFIX = 'sfa/quotes'

/** JSTの今日（YYYY-MM-DD） */
export function todayJst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}
