/**
 * 送る人の判定（DBに触らない純粋関数。テストしやすいよう service から分離）
 * 条件: 受信ON・アドレス有効・会員ステータスが無効でない・除外グループ以外・配信停止リスト以外・アドレス重複なし
 */
import type { BcartCustomer, BcartViewGroup } from './bcart'

export interface AudienceSummary {
  total_customers: number
  mm_on: number
  eligible: number
  resubscribed: number // 配信停止のあとBカートで受信をONに戻したため、停止リストから外した人
  excluded: {
    by_group: Array<{ id: number; name: string; count: number }>
    invalid_email: number
    inactive: number
    suppressed: number
    duplicate: number
  }
}

export interface AudienceRow {
  bcart_customer_id: number
  email: string
  comp_name: string | null
  tanto_name: string | null
  view_group_id: number | null // null = 通常会員
}

export interface SuppressionRow {
  id: number
  email: string
  reason: string
  bcart_customer_id: number | null
  bcart_synced_at: string | null
}

/**
 * 配信停止したあと、Bカートで受信をONに戻した人（＝停止リストから外す人）を探す
 * 停止時にこちらで mm_flag=0 を書き戻している（bcart_synced_at あり）のに今 1 なら、その後に本人か担当者がONにしたということ
 * - 外すのは reason='unsubscribed' だけ（迷惑メール報告・不達は外さない）
 * - 書き戻しに失敗していた人は、元の 1 が残っているだけなので外さない
 */
export function findResubscribed(customers: BcartCustomer[], suppressions: SuppressionRow[]): SuppressionRow[] {
  const mmOn = new Set(customers.filter((c) => Number(c.mm_flag) === 1).map((c) => c.id))
  return suppressions.filter((s) =>
    s.reason === 'unsubscribed' && s.bcart_synced_at && s.bcart_customer_id != null && mmOn.has(s.bcart_customer_id))
}

export function computeAudience(
  customers: BcartCustomer[],
  groups: BcartViewGroup[],
  excludedGroupIds: number[],
  suppressed: Set<string>,
): { rows: AudienceRow[]; summary: AudienceSummary } {
  const excludedGroups = new Set(excludedGroupIds)
  const groupName = new Map(groups.map((g) => [g.id, g.name]))
  const summary: AudienceSummary = {
    total_customers: customers.length, mm_on: 0, eligible: 0, resubscribed: 0,
    excluded: { by_group: [], invalid_email: 0, inactive: 0, suppressed: 0, duplicate: 0 },
  }
  const byGroup = new Map<number, number>()
  const seen = new Set<string>()
  const rows: AudienceRow[] = []

  for (const cu of customers) {
    if (Number(cu.mm_flag) !== 1) continue
    summary.mm_on++
    const email = (cu.email ?? '').trim().toLowerCase()
    if (!email || Number(cu.is_invalid_email) === 1 || !email.includes('@')) { summary.excluded.invalid_email++; continue }
    if ((cu.status ?? '').includes('無効')) { summary.excluded.inactive++; continue }
    const vg = cu.view_group_id == null || String(cu.view_group_id) === '' ? null : Number(cu.view_group_id)
    if (vg != null && excludedGroups.has(vg)) { byGroup.set(vg, (byGroup.get(vg) ?? 0) + 1); continue }
    if (suppressed.has(email)) { summary.excluded.suppressed++; continue }
    if (seen.has(email)) { summary.excluded.duplicate++; continue }
    seen.add(email)
    rows.push({
      bcart_customer_id: cu.id,
      email,
      comp_name: cu.comp_name?.trim() || null,
      tanto_name: [cu.tanto_last_name, cu.tanto_first_name].map((s) => s?.trim()).filter(Boolean).join(' ') || null,
      view_group_id: vg,
    })
  }
  summary.eligible = rows.length
  summary.excluded.by_group = [...excludedGroups].map((gid) => ({ id: gid, name: groupName.get(gid) ?? `グループ${gid}`, count: byGroup.get(gid) ?? 0 }))
  return { rows, summary }
}
