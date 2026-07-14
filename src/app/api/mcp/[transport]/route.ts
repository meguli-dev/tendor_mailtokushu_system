/**
 * 見積もりエンジン MCPサーバー（テンドール専用）
 * Claude のカスタムコネクタ / Claude Code から Streamable HTTP で接続する。
 *   エンドポイント: /api/mcp/mcp
 *   認証: Authorization: Bearer ${YOUKINAVI_MCP_KEY}
 * ロジックはすべてDBのRPC（public.youkinavi_*）に委譲し、ここは薄いラッパーに徹する。
 */
import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

async function callRpc(fn: string, args: Record<string, unknown>) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    return { content: [{ type: 'text' as const, text: `エラー: ${error.message}` }], isError: true }
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 1) }] }
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'youkinavi_search',
      '容器を型番・商品名で検索し、勝ち負け診断を返す。表記ゆれ（全角半角・ハイフン・半角カナ）は自動吸収。current_priceに顧客の現在価格(円/枚)を渡すと「勝ち/戦える/負け」の判定と特値レンジを返す。応答のcost_price/floor_priceは社外秘であり、顧客への提示・送信は絶対に禁止。',
      {
        q: z.string().describe('型番または商品名（例: 60-1A CR、Kランチ52Sムジ）'),
        current_price: z.number().optional().describe('顧客の現在価格（円/枚、税抜）'),
        limit_n: z.number().int().min(1).max(20).optional().describe('候補数上限（既定8）'),
      },
      async ({ q, current_price, limit_n }) =>
        callRpc('youkinavi_search', { q, current_price: current_price ?? null, limit_n: limit_n ?? 8 })
    )

    server.tool(
      'youkinavi_quote',
      '見積もり計算（単品・セット両対応）。itemsに品目を1つ渡せば単品、複数渡せば本体+蓋などのセット合算で1セット単価を計算する。基準売価=仕入原価×1.25。自社配送(own)は送料800円を送料無料ライン5,000円の頭割りで単価に込み。直送(direct)は元払い条件以上なら基準売価、未満は要個別確認を返す。calc_stepsに計算式の内訳が入る。単価は税抜・送料込みで確定し、決済後の送料追加はしない。cost_price/floor_price系は社外秘。顧客が「本体と蓋セットで◯円」と言っている場合は必ず両品目をitemsに入れて比較すること。',
      {
        items: z.array(z.string()).min(1).max(5).describe('型番または商品名の配列。単品は1要素、セット（本体+蓋等）は複数要素（例: ["BF-362 ホワイト本体", "BF-362 嵌合蓋"]）'),
        qty: z.number().int().min(1).describe('数量（ケース数）'),
        mode: z.enum(['own', 'direct', 'bara']).optional().describe('own=自社配送・ケース（既定、マージン25%）/ direct=メーカー直送（マージン15%）/ bara=バラ売り（マージン25%）'),
        pref: z.string().optional().describe('届け先都道府県（北海道・沖縄は自動計算対象外の警告を返す）'),
      },
      async ({ items, qty, mode, pref }) =>
        callRpc('youkinavi_quote_set', { items, qty, mode: mode ?? 'own', pref: pref ?? null })
    )

    server.tool(
      'youkinavi_freight',
      'メーカーの直送運賃・元払い条件、地域特殊運賃、都道府県別の自社配送タリフを検索する。引数なしで全メーカー一覧。',
      {
        p_maker: z.string().optional().describe('メーカー名（部分一致）'),
        p_pref: z.string().optional().describe('都道府県名'),
      },
      async ({ p_maker, p_pref }) =>
        callRpc('youkinavi_freight', { p_maker: p_maker ?? null, p_pref: p_pref ?? null })
    )

    server.tool(
      'youkinavi_cost_upsert',
      '仕入原価の登録・更新。単価0以下は拒否。既存価格から±50%超の変動はforce=trueがない限りブロック（打ち間違い対策）。物理削除は不可（廃番はstatusで管理）。全操作がprice_historyに記録されるため操作者名が必須。',
      {
        p_code: z.string().describe('商品コード'),
        p_name: z.string().describe('商品名'),
        p_price: z.number().describe('新単価（円/枚、税抜）'),
        p_operator: z.string().describe('操作者名（必須）'),
        p_maker_id: z.string().optional().describe('メーカーID（M001〜M036、新規登録時）'),
        p_nyusu: z.number().int().optional().describe('入数'),
        p_status: z.string().optional().describe('状態（改定/新規登録/廃番など）'),
        p_source: z.string().optional().describe('出典（例: ○○改定見積 2026/7/14）'),
        p_force: z.boolean().optional().describe('±50%超の変動を強制適用'),
      },
      async (args) =>
        callRpc('youkinavi_cost_upsert', {
          p_code: args.p_code, p_name: args.p_name, p_price: args.p_price, p_operator: args.p_operator,
          p_maker_id: args.p_maker_id ?? null, p_nyusu: args.p_nyusu ?? null,
          p_status: args.p_status ?? null, p_source: args.p_source ?? null, p_force: args.p_force ?? false,
        })
    )

    server.tool(
      'youkinavi_history',
      '価格更新履歴の参照（監査・差し戻し確認用）。',
      {
        p_from: z.string().optional().describe('開始日 YYYY-MM-DD'),
        p_to: z.string().optional().describe('終了日 YYYY-MM-DD'),
        p_code: z.string().optional().describe('商品コード'),
        limit_n: z.number().int().optional().describe('件数上限（既定50）'),
      },
      async ({ p_from, p_to, p_code, limit_n }) =>
        callRpc('youkinavi_history', { p_from: p_from ?? null, p_to: p_to ?? null, p_code: p_code ?? null, limit_n: limit_n ?? 50 })
    )
  },
  {
    serverInfo: { name: 'youkinavi-quote', version: '1.0.0' },
  },
  {
    basePath: '/api/mcp',
    disableSse: true, // ステートレス運用（Redis不要）
  }
)

function authorized(request: Request): boolean {
  const key = process.env.YOUKINAVI_MCP_KEY
  if (!key) return false
  const header = request.headers.get('authorization') || ''
  return header === `Bearer ${key}`
}

async function guarded(request: Request) {
  if (!authorized(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return handler(request)
}

export { guarded as GET, guarded as POST, guarded as DELETE }
