/**
 * SFA MCPサーバー（Claude のカスタムコネクタ / Claude Code 用）
 *   エンドポイント: /api/sfa/mcp/mcp
 *   認証: Authorization: Bearer <個人キー sfa_...>（管理画面のメンバーから発行）
 *         YOUKINAVI_MCP_KEY は管理用として SFA_MCP_DEFAULT_MEMBER（既定 meguli）扱い
 * 操作者はキーから確定し、履歴の記録者になる。ロジックは src/lib/sfa/service.ts に委譲する。
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'
import { memberFromBearer, type SfaMember } from '@/lib/sfa/member'
import { listInbox } from '@/lib/sfa/quote-ingest'
import {
  appointmentSchema, containerSchema, dealPatchSchema, logContactSchema, nextActionSchema,
} from '@/lib/sfa/schemas'
import {
  addContainer, addQuoteFile, assertCanUploadQuote, createAppointment, createTask, ensureQuoteRequest, getDeal, getTodayBoard,
  listDeals, listMembers, listQuoteQueue, logContact, pipelineSummary, quoteFileUrl, requestQuote,
  requestRevision, rescheduleTask, SfaError, updateCompany, updateDeal, upsertContact,
} from '@/lib/sfa/service'
import { STAGES } from '@/lib/sfa/constants'

const als = new AsyncLocalStorage<SfaMember>()
const me = () => {
  const m = als.getStore()
  if (!m) throw new SfaError('認証されていません', 401)
  return m
}

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const data = await fn()
    return { content: [{ type: 'text', text: JSON.stringify(data ?? { ok: true }, null, 1) }] }
  } catch (e) {
    const dup = (e as { duplicates?: unknown }).duplicates
    const msg = e instanceof Error ? e.message : String(e)
    return { content: [{ type: 'text', text: `エラー: ${msg}${dup ? `\n重複候補: ${JSON.stringify(dup)}` : ''}` }], isError: true }
  }
}

async function memberIdByName(name?: string | null): Promise<number | undefined> {
  if (!name) return undefined
  const m = (await listMembers()).find((x) => x.name === name)
  if (!m) throw new SfaError(`メンバー「${name}」が見つかりません`)
  return m.id
}

/** Google Driveの共有リンクは直接ダウンロードURLに変換する */
function toDownloadUrl(url: string): string {
  const id = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)?.[1] || url.match(/[?&]id=([^&]+)/)?.[1]
  return id && url.includes('drive.google.com') ? `https://drive.google.com/uc?export=download&id=${id}` : url
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'sfa_today',
      '今日やるべき案件のボード。期限切れ（予定日を過ぎて未対応＝電話できていない可能性）/今日/7日以内/次回予定が未設定/回答待ち（検討中・回答予定日順）/見積作成待ち を返す。毎朝の確認や「今日どこに電話すべき？」に使う。',
      {
        mine: z.boolean().optional().describe('trueで自分が対応担当の案件のみ'),
        owner_name: z.string().optional().describe('対応担当の名前で絞る'),
      },
      async ({ mine, owner_name }) => run(async () =>
        getTodayBoard({ ownerId: mine ? me().id : await memberIdByName(owner_name) })),
    )

    server.tool(
      'sfa_search_deals',
      '案件の検索・一覧。店舗名・担当者名・電話番号の一部で検索できる。stageで段階を絞る。',
      {
        q: z.string().optional().describe('店舗名・担当者名・電話番号（下4桁でも可）'),
        stage: z.array(z.enum(STAGES)).optional(),
        open: z.boolean().optional().describe('true=進行中のみ / false=受注・失注のみ'),
        owner_name: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
      async ({ q, stage, open, owner_name, limit }) => run(async () =>
        listDeals({ q, stage, open, ownerId: await memberIdByName(owner_name), limit: limit ?? 50 })),
    )

    server.tool(
      'sfa_get_deal',
      '案件の詳細（店舗・担当者・接触履歴・次のアクション・使用中容器・見積依頼と見積書の版）。',
      { deal_id: z.number().int() },
      async ({ deal_id }) => run(() => getDeal(deal_id)),
    )

    server.tool(
      'sfa_pipeline',
      'パイプライン集計（段階別・対応担当別・トスアップ月別の件数、会員登録＋受注の転換率）。分析・週次レビュー用。',
      {},
      async () => run(() => pipelineSummary()),
    )

    server.tool(
      'sfa_register_appointment',
      'アポ獲得した店舗を登録する（会社・先方担当者・案件・次のアクションを一括作成）。同じ店名・電話番号の案件があると409エラーで候補を返すので、別案件として登録する場合のみ force=true。next（次のアクション日付）は必須。request_quote を付けると見積作成依頼も同時に出す。',
      appointmentSchema.shape,
      async (args) => run(() => createAppointment(me(), args, 'mcp')),
    )

    server.tool(
      'sfa_log_contact',
      '接触の記録（架電・不在・見積提示・商談・メール等）。既存の次のアクションは完了扱いになり、next で次回予定を登録する（進行中の案件は next 必須）。kind=見積提示 のときは見積を提示済にし段階を検討中へ進め、next.due_on を回答予定日にする。電話に出なかった場合は kind=不在 と次回架電日を入れる。',
      { deal_id: z.number().int(), ...logContactSchema.shape },
      async ({ deal_id, ...rest }) => run(() => logContact(me(), { deal_id, ...rest }, 'mcp')),
    )

    server.tool(
      'sfa_update_deal',
      '案件の更新（段階・温度感・対応担当・検討内容・回答予定日・使用中容器の原文・失注理由など）。company / contact で店舗・先方担当者の情報も更新できる。段階変更は履歴に自動記録される。',
      { deal_id: z.number().int(), owner_name: z.string().optional().describe('対応担当を名前で指定'), ...dealPatchSchema.shape },
      async ({ deal_id, owner_name, company, contact, ...patch }) => run(async () => {
        const deal = await getDeal(deal_id) as unknown as { company_id: number }
        if (company && Object.keys(company).length) await updateCompany(deal.company_id, company)
        if (contact && Object.keys(contact).length) await upsertContact(deal.company_id, contact, deal_id)
        const ownerId = await memberIdByName(owner_name)
        await updateDeal(me(), deal_id, { ...patch, ...(ownerId ? { owner_id: ownerId } : {}) }, 'mcp')
        return getDeal(deal_id)
      }),
    )

    server.tool(
      'sfa_set_next_action',
      '次のアクションを追加、または既存タスクの日付変更（task_id 指定時）。接触の記録を伴わない予定変更に使う。',
      { deal_id: z.number().int(), task_id: z.number().int().optional(), ...nextActionSchema.shape },
      async ({ deal_id, task_id, ...next }) => run(async () => {
        if (task_id) await rescheduleTask(me(), task_id, next)
        else await createTask(me(), deal_id, next)
        return { ok: true }
      }),
    )

    server.tool(
      'sfa_add_container',
      '顧客が今使っている容器と価格を登録する。unit_price は1枚あたり円（税抜）に換算して入れ、元の言い方は price_note に残す。',
      { deal_id: z.number().int(), ...containerSchema.shape },
      async ({ deal_id, ...c }) => run(() => addContainer(deal_id, c)),
    )

    server.tool(
      'sfa_request_quote',
      'テンドールに見積作成を依頼する（見積書専用Chatworkルームに #Q-番号 付きで依頼が投稿される）。案件は「見積依頼」段階になる。',
      { deal_id: z.number().int(), note: z.string().optional().describe('対象容器・数量・条件など'), due_on: z.string().optional().describe('回答希望日 YYYY-MM-DD') },
      async ({ deal_id, note, due_on }) => run(() => requestQuote(me(), { deal_id, note, due_on }, 'mcp')),
    )

    server.tool(
      'sfa_request_revision',
      '見積の修正を依頼する（見積書ルームに修正依頼が投稿され、届いたPDFは次の版として自動登録される）。',
      { quote_request_id: z.number().int(), note: z.string().min(1).describe('修正内容') },
      async ({ quote_request_id, note }) => run(() => requestRevision(me(), { quote_request_id, note }, 'mcp')),
    )

    server.tool(
      'sfa_upload_quote',
      '見積書ファイルを案件に登録する（版は自動採番）。content_base64（ファイル本体）か url（https。Google Driveの共有リンク可）のどちらかを渡す。quote_request_id が無ければ deal_id の未完了の見積依頼に紐付ける（無ければ自動作成）。',
      {
        quote_request_id: z.number().int().optional(),
        deal_id: z.number().int().optional(),
        file_name: z.string().min(1).describe('例: 御見積書_やっ家様.pdf'),
        content_base64: z.string().optional(),
        url: z.string().url().optional(),
        note: z.string().optional(),
      },
      async ({ quote_request_id, deal_id, file_name, content_base64, url, note }) => run(async () => {
        await assertCanUploadQuote(me())
        const qrId = quote_request_id ?? (deal_id ? await ensureQuoteRequest(deal_id, 'MCPからの見積書登録') : undefined)
        if (!qrId) throw new SfaError('quote_request_id か deal_id を指定してください')
        let buffer: Buffer
        let mime: string | null = null
        if (content_base64) buffer = Buffer.from(content_base64, 'base64')
        else if (url) {
          if (!url.startsWith('https://')) throw new SfaError('url は https のみ対応です')
          const res = await fetch(toDownloadUrl(url))
          if (!res.ok) throw new SfaError(`ファイルを取得できませんでした（${res.status}）`)
          mime = res.headers.get('content-type')
          if (mime?.includes('text/html')) throw new SfaError('URLがファイルではなくページを返しました（共有設定を「リンクを知っている全員」にしてください）')
          buffer = Buffer.from(await res.arrayBuffer())
        } else throw new SfaError('content_base64 か url を指定してください')
        return addQuoteFile(me(), { quote_request_id: qrId, buffer, file_name, mime_type: mime, note, source: 'mcp' })
      }),
    )

    server.tool(
      'sfa_quote_file_url',
      '見積書ファイルのダウンロードURL（10分有効）。',
      { file_id: z.number().int() },
      async ({ file_id }) => run(() => quoteFileUrl(file_id)),
    )

    server.tool(
      'sfa_quote_queue',
      'テンドールの見積作成待ち（依頼中・作成中・修正依頼）と、Chatworkから届いたが紐付けできていない見積書（仕分け待ち）。',
      {},
      async () => run(async () => ({ queue: await listQuoteQueue(), inbox: await listInbox() })),
    )

    server.tool(
      'sfa_members',
      'SFAメンバー（対応担当・テレアポ）の一覧と、自分が誰として操作しているか。',
      {},
      async () => run(async () => ({ me: { id: me().id, name: me().name, role: me().role }, members: (await listMembers()).filter((m) => m.active).map(({ id, name, tenant_name, role }) => ({ id, name, tenant_name, role })) })),
    )
  },
  { serverInfo: { name: 'tendor-sfa', version: '1.0.0' } },
  { basePath: '/api/sfa/mcp', disableSse: true, maxDuration: 60 },
)

async function guarded(request: Request) {
  const member = await memberFromBearer(request.headers.get('authorization'))
  if (!member) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  return als.run(member, () => handler(request))
}

export { guarded as GET, guarded as POST, guarded as DELETE }
export const maxDuration = 60
