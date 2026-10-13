/**
 * sfa_import_tossup.py が出力した sfa_import_preview.json を本番DBへ投入する
 *   node scripts/sfa_import_run.mjs <preview.json> [--dry]
 * .env.local の NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を使用
 * 既に legacy_no+会社名 が同じ案件があればスキップ（再実行しても二重登録しない）
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
)
const [, , file, flag] = process.argv
const dry = flag === '--dry'
const recs = JSON.parse(fs.readFileSync(file, 'utf8'))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// SCOS共通DBは他アプリの負荷でタイムアウトすることがあるため、一時的な失敗は間隔を空けて再試行する
// p はクエリビルダー（thenable）。再試行のたびに作り直すため関数で受け取る
const TRANSIENT = /timeout|schema cache|connection|fetch failed|503|502|504/i
async function must(build, tries = 6) {
  const q = typeof build === 'function' ? build : () => build
  for (let i = 1; ; i++) {
    const { data, error } = await q()
    if (!error) return data
    if (i >= tries || !TRANSIENT.test(error.message)) throw new Error(error.message)
    await new Promise((r) => setTimeout(r, 2000 * 2 ** (i - 1)))
  }
}

// SCOSのテナント（案件の持ち主はテンドール物流）
const tenants = await must(db.from('tenants').select('id,name').in('name', ['テンドール物流株式会社', '株式会社meguli']))
const TENDOR = tenants.find((t) => t.name === 'テンドール物流株式会社')?.id
const MEGULI = tenants.find((t) => t.name === '株式会社meguli')?.id
if (!TENDOR || !MEGULI) throw new Error('SCOSのテナントが見つかりません')

// 「meguli」はmeguli側テレアポ担当の総称。個人メンバー登録後に案件を付け替える
const MEMBERS = [
  // 最初の管理者（ログインすると自動で紐付く）。以降のメンバー登録は SFA → メンバー 画面から行う
  { name: '平岡', tenant_id: MEGULI, role: 'admin', email: 'yuji.hiraoka@meguli.jp' },
  { name: 'meguli', tenant_id: MEGULI, role: 'admin' },
  ...['葛西', '大石', '佐藤', '鈴木薫'].map((name) => ({ name, tenant_id: TENDOR, role: 'admin' })),
]

if (!dry) await must(db.from('sfa_members').upsert(MEMBERS, { onConflict: 'name', ignoreDuplicates: true }))
const members = dry ? [] : await must(db.from('sfa_members').select('id,name'))
const mid = (n) => members.find((m) => m.name === n)?.id ?? null

// 登録済みの会社名（案件あり）を一括取得してスキップ判定する
const existing = new Set()
if (!dry) {
  const rows = await must(() => db.from('sfa_deals').select('sfa_companies!inner(name)').eq('tenant_id', TENDOR).limit(10000))
  rows.forEach((row) => existing.add(row.sfa_companies.name))
}

let done = 0, skipped = 0
for (const r of recs) {
  const d = r.deal
  if (dry) { done++; continue }
  if (existing.has(r.company.name)) { skipped++; continue }

  const [co] = await must(db.from('sfa_companies').insert({ tenant_id: TENDOR, ...r.company }).select('id'))
  const [ct] = await must(db.from('sfa_contacts').insert({ company_id: co.id, ...r.contact }).select('id'))
  const owner = mid(d.owner)
  const closed = d.closed_on ? `${d.closed_on}T00:00:00+09:00` : null
  const [deal] = await must(db.from('sfa_deals').insert({
    tenant_id: TENDOR, company_id: co.id, contact_id: ct.id, stage: d.stage, temperature: d.temperature, owner_id: owner,
    tossed_at: d.tossed_at, hearing: d.hearing, current_containers_text: d.containers,
    considering: d.considering, lost_reason: d.lost_reason, closed_at: closed,
    stage_changed_at: closed ?? new Date().toISOString(), legacy_no: r.no, legacy: d.legacy,
  }).select('id'))

  if (r.activities.length) {
    await must(db.from('sfa_activities').insert(r.activities.map((a, i) => ({
      deal_id: deal.id, occurred_on: a.on, kind: a.kind, body: a.body, member_id: owner, source: 'import', seq: i,
    }))))
  }
  if (r.task) {
    await must(db.from('sfa_tasks').insert({ deal_id: deal.id, due_on: r.task.due_on, kind: r.task.kind, note: r.task.note, assignee_id: owner }))
  }
  if (r.quote_request) {
    await must(db.from('sfa_quote_requests').insert({
      deal_id: deal.id, status: r.quote_request.status, request_note: r.quote_request.note,
      requested_at: d.tossed_at ? `${d.tossed_at}T00:00:00+09:00` : undefined,
    }))
  }
  done++
}
console.log(JSON.stringify({ total: recs.length, inserted: dry ? 0 : done, skipped, dry }))
