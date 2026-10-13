// SFA画面の共通ユーティリティ（クライアント用）
import { toast } from 'sonner'

/** JSTの今日（YYYY-MM-DD） */
export function todayJst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

export function addDays(base: string, days: number): string {
  return new Date(Date.parse(base) + days * 86400_000).toISOString().slice(0, 10)
}

export function addMonths(base: string, months: number): string {
  const d = new Date(Date.parse(base))
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' → 'M/D'（年が今年でなければ 'YYYY/M/D'） */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return s
  return y === Number(todayJst().slice(0, 4)) ? `${m}/${d}` : `${y}/${m}/${d}`
}

export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return ''
  const t = new Date(Date.parse(s) + 9 * 3600_000).toISOString()
  return `${fmtDate(t.slice(0, 10))} ${t.slice(11, 16)}`
}

export const DATE_PRESETS: Array<{ label: string; calc: (today: string) => string }> = [
  { label: '明日', calc: (t) => addDays(t, 1) },
  { label: '3日後', calc: (t) => addDays(t, 3) },
  { label: '1週間後', calc: (t) => addDays(t, 7) },
  { label: '2週間後', calc: (t) => addDays(t, 14) },
  { label: '1ヶ月後', calc: (t) => addMonths(t, 1) },
]

/** fetch → JSON。失敗時は data.error をトーストして例外 */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown; silent?: boolean }): Promise<T> {
  const { json, silent, ...rest } = init || {}
  const res = await fetch(url, {
    ...rest,
    ...(json !== undefined
      ? { body: JSON.stringify(json), headers: { 'Content-Type': 'application/json', ...(rest.headers || {}) } }
      : {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = Object.assign(new Error((data as { error?: string }).error || '処理に失敗しました'), { status: res.status, data })
    if (!silent) toast.error(err.message)
    throw err
  }
  return data as T
}

export const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm dark:bg-input/30'

export const telHref = (tel: string | null | undefined) => (tel ? `tel:${tel.replace(/[^0-9+]/g, '')}` : undefined)
