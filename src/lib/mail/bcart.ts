/**
 * Bカート API（会員まわり）
 * レート制限は 300リクエスト/300秒。全件取得でも約30リクエストなので余裕がある
 */
const BCART_API = 'https://api.bcart.jp/api/v1'

export interface BcartCustomer {
  id: number
  comp_name: string | null
  tanto_last_name: string | null
  tanto_first_name: string | null
  email: string | null
  is_invalid_email: number
  mm_flag: number
  view_group_id: number | null
  status: string | null
  updated_at: string | null
}

export interface BcartViewGroup {
  id: number
  name: string
}

async function bcartFetch(path: string, init: RequestInit = {}, attempt = 0): Promise<unknown> {
  const token = process.env.BCART_ACCESS_TOKEN
  if (!token) throw new Error('BCART_ACCESS_TOKEN が設定されていません')
  const res = await fetch(`${BCART_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(init.headers || {}) },
    cache: 'no-store',
  })
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
    return bcartFetch(path, init, attempt + 1)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Bカート API エラー（${res.status} ${path}）: ${text.slice(0, 200)}`)
  }
  return res.status === 204 ? null : res.json()
}

type CustomersPage = { customers?: BcartCustomer[]; meta?: { total?: number } }

/** 会員を全件取得する（100件ずつ。1ページ目で総数を見て、残りは5本並行で取る） */
export async function fetchAllCustomers(): Promise<BcartCustomer[]> {
  const first = (await bcartFetch('/customers?limit=100&offset=0')) as CustomersPage
  const all: BcartCustomer[] = [...(first.customers ?? [])]
  const total = first.meta?.total ?? 0
  const offsets: number[] = []
  for (let o = 100; o < total; o += 100) offsets.push(o)
  for (let i = 0; i < offsets.length; i += 5) {
    const pages = await Promise.all(offsets.slice(i, i + 5).map((o) => bcartFetch(`/customers?limit=100&offset=${o}`) as Promise<CustomersPage>))
    for (const p of pages) all.push(...(p.customers ?? []))
  }
  // 取得中に会員が増減した場合に備えて、IDで重複を除く
  return [...new Map(all.map((c) => [c.id, c])).values()]
}

/** 閲覧グループ（管理画面の絞り込み項目と同じもの） */
export async function fetchViewGroups(): Promise<BcartViewGroup[]> {
  const json = (await bcartFetch('/view_groups?limit=100')) as { view_groups?: Array<{ id: number | string; name: string }> }
  return (json.view_groups ?? []).map((g) => ({ id: Number(g.id), name: g.name }))
}

/** メルマガ受信フラグを書き換える（配信停止の書き戻し） */
export async function updateCustomerMmFlag(customerId: number, mmFlag: 0 | 1): Promise<void> {
  await bcartFetch(`/customers/${customerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mm_flag: mmFlag }),
  })
}
