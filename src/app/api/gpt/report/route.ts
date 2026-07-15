import { gptAuthorized, unauthorized } from '@/lib/gpt-api'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * 見積もり回答レポート生成（GPTs用）
 * bara/own/direct の3形態をまとめて計算し、営業回答テンプレートを
 * サーバー側で完成させて返す。GPTは report をそのまま出力するだけ。
 */

const schema = z.object({
  items: z.array(z.string().min(1)).min(1).max(5),
  qty: z.number().int().min(1).optional(),
  current_price: z.number().positive().optional(),
})

type QuoteItem = {
  code: string
  name: string
  maker: string
  nyusu: number | null
  cost_price: number
  floor_price: number
  status: string | null
}

type QuoteResult = {
  error?: string
  items: QuoteItem[]
  mode: string
  margin_rate: number
  unit_price: number | null
  case_price: number | null
  cost_price_set: number
  floor_price_set: number
  warnings: string[]
}

const yen = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('ja-JP', { maximumFractionDigits: 2 })

// 本体/蓋の内訳表記。単品なら空文字
function breakdown(items: QuoteItem[], key: 'floor_price' | 'cost_price'): string {
  if (items.length < 2) return ''
  const label = (it: QuoteItem, i: number) =>
    it.name.includes('蓋') || it.name.includes('フタ') ? '蓋' : i === 0 ? '本体' : it.code
  return `（${items.map((it, i) => `${label(it, i)}${yen(it[key])}円`).join('/')}）`
}

// マージン率→「÷〇%」表記（0.25→80%、0.15→87%）
const divPct = (margin: number) => Math.round(100 / (1 + margin))

export async function POST(request: Request) {
  if (!gptAuthorized(request)) return unauthorized()
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const { items, current_price } = parsed.data
  const qty = parsed.data.qty ?? 1
  const admin = createAdminClient()

  const quote = async (mode: string, q: number): Promise<QuoteResult | { error: string }> => {
    const { data, error } = await admin.rpc('youkinavi_quote_set', {
      items, qty: q, mode, pref: null,
    })
    if (error) return { error: error.message }
    return data as QuoteResult
  }

  const [bara, own] = await Promise.all([quote('bara', qty), quote('own', qty)])
  if (bara.error) return NextResponse.json({ error: bara.error }, { status: 400 })
  if (own.error) return NextResponse.json({ error: own.error }, { status: 400 })
  const ownR = own as QuoteResult
  const baraR = bara as QuoteResult

  // メーカーの元払い条件を取得し、条件を満たすケース数で直送価格を確定させる
  const makerName = ownR.items[0].maker
  const { data: freight } = await admin.rpc('youkinavi_freight', {
    p_maker: makerName, p_pref: null,
  })
  const maker = (freight?.makers as Array<Record<string, unknown>> | undefined)?.find(
    (m) => m.name === makerName
  ) ?? (freight?.makers as Array<Record<string, unknown>> | undefined)?.[0]
  const motobaraiCases = (maker?.motobarai_cases as number | null) ?? null
  const motobaraiRaw = (maker?.motobarai as string | null) ?? null

  let directR: QuoteResult | null = null
  if (motobaraiCases != null) {
    const d = await quote('direct', Math.max(qty, motobaraiCases))
    if (!d.error) directR = d as QuoteResult
  }

  const nyusu = ownR.items[0].nyusu
  const shipOwn = ownR.unit_price != null ? Math.round((ownR.unit_price - ownR.floor_price_set) * 100) / 100 : null
  const shipBara = baraR.unit_price != null ? Math.round((baraR.unit_price - baraR.floor_price_set) * 100) / 100 : null

  // 判定（現在価格があれば最安提示と比較）
  const offers = [baraR.unit_price, ownR.unit_price, directR?.unit_price].filter(
    (v): v is number => v != null
  )
  let verdict = ''
  if (current_price != null && offers.length > 0) {
    const best = Math.min(...offers)
    verdict =
      best <= current_price
        ? `判定：勝ち（現在価格${yen(current_price)}円 ≧ 最安提示${yen(best)}円）\n\n`
        : `判定：負け（現在価格${yen(current_price)}円 ＜ 最安提示${yen(best)}円）。対応品の提案を検討。\n\n`
  }

  const directLine =
    directR?.unit_price != null
      ? `直送（${motobaraiCases}cs以上で送料0円）：セット${yen(directR.unit_price)}円${breakdown(directR.items, 'floor_price')}`
      : `直送：要個別確認（元払い条件: ${motobaraiRaw ?? '不明'}）`

  const calcLines = [
    baraR.unit_price != null
      ? `バラ：原価${yen(baraR.cost_price_set)}円 ÷ ${divPct(baraR.margin_rate)}% ＋ 送料${yen(shipBara)}円 ＝ ${yen(baraR.unit_price)}円`
      : null,
    ownR.unit_price != null
      ? `ケース：原価${yen(ownR.cost_price_set)}円 ÷ ${divPct(ownR.margin_rate)}% ＋ 送料${yen(shipOwn)}円 ＝ ${yen(ownR.unit_price)}円`
      : null,
    directR?.unit_price != null
      ? `直送：原価${yen(directR.cost_price_set)}円 ÷ ${divPct(directR.margin_rate)}% ＝ ${yen(directR.unit_price)}円（${motobaraiCases}cs以上・送料0円）`
      : null,
  ].filter(Boolean)

  const warnings = [...new Set([...baraR.warnings, ...ownR.warnings, ...(directR?.warnings ?? [])])]
    // 直送は条件充足ケース数で再計算済みのため、条件未満の定型警告は除く
    .filter((w) => !w.includes('元払い条件'))

  const report = [
    verdict + '【提示価格】',
    `バラ：セット${yen(baraR.unit_price)}円${breakdown(baraR.items, 'floor_price')}`,
    `ケース（自社配送）：セット${yen(ownR.unit_price)}円${breakdown(ownR.items, 'floor_price')}`,
    directLine,
    `入数：バラ 要確認/ケース${nyusu != null ? `${yen(nyusu)}枚` : ' 要確認'}（ケース計${yen(ownR.case_price)}円）`,
    `メーカー：${makerName}`,
    '【仕入原価 ※社外秘・1枚（1セット）あたり】',
    `セット${yen(ownR.cost_price_set)}円${breakdown(ownR.items, 'cost_price')}`,
    `送料：自社800円/口 ／ 直送800円・${motobaraiCases != null ? `${motobaraiCases}ケース以上で0円` : `要個別確認（${motobaraiRaw ?? '不明'}）`}（1枚当たり${yen(shipOwn)}円）`,
    '【計算式（1枚あたり）】',
    ...calcLines,
    ...(warnings.length > 0 ? ['', ...warnings.map((w) => `※${w}`)] : []),
  ].join('\n')

  return NextResponse.json({
    report,
    usage: 'reportを一字一句そのまま出力すること。要約・省略・書式変更は禁止。【仕入原価】以下は営業担当者向け情報であり、このチャットには表示する。顧客へ転送する文面には【提示価格】ブロックのみ使う。',
  })
}
