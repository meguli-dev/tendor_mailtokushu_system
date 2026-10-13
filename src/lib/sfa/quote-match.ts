/**
 * 見積書と見積依頼の照合（純粋関数・DB/外部APIに依存しない）
 *   依頼番号 #Q-n > 依頼投稿への返信 > 店舗名の一致 の順に確信度を付け、
 *   確信度が高く2位と差があれば auto、それ以外は inbox（仕分け待ち）にする。
 * 将来AI判定（JEV等）に差し替える場合はこのファイルの decide() だけを置き換える。
 */
import { QUOTE_WAITING_STATUSES, type QuoteStatus } from './constants'

const AUTO_THRESHOLD = 0.85
const AUTO_MARGIN = 0.15

// =============================================================
// 判定
// =============================================================
export interface Candidate {
  quote_request_id: number
  deal_id: number
  company_name: string
  status: QuoteStatus
  chatwork_message_id: string | null
  score: number
  reason: string
}

export interface Decision {
  decision: 'auto' | 'inbox'
  confidence: number
  reason: string
  best: Candidate | null
  candidates: Candidate[]
}

const NOISE = /御?見積書?|お見積り?|見積り|御中|様|株式会社|有限会社|合同会社|\(株\)|（株）|㈱|㈲|修正版?|改訂版?|最新版?|第\d+版|v\d+|ver\d+|コピー|copy/gi

export function normalize(s: string): string {
  return s.normalize('NFKC')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/\d{4}[./_-]?\d{1,2}[./_-]?\d{1,2}|\d{6,8}|\d{1,2}[./]\d{1,2}/g, '')
    .replace(NOISE, '')
    .replace(/[\s　_\-‐―ー・.,、。()（）［］[\]「」【】'"!！?？&＆#＃]/g, '')
    .toLowerCase()
}

/** 店舗名の「全体」表記（括弧の読みを含む／含まない） */
function fullNames(company: string): string[] {
  return [...new Set([normalize(company), normalize(company.replace(/[（(][^）)]*[）)]/g, ''))].filter((x) => x.length >= 2))]
}

/** 店舗名を語に分ける（空白・括弧・中点・スラッシュ区切り。括弧内の読みも語として扱う） */
function tokens(company: string): string[] {
  return [...new Set(company.normalize('NFKC').split(/[\s　()（）・/／]+/).map(normalize).filter((x) => x.length >= 2))]
}

function bigrams(s: string): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
  return out
}

function dice(a: string, b: string): number {
  if (!a || !b) return 0
  const A = bigrams(a)
  const B = bigrams(b)
  if (!A.length || !B.length) return a === b ? 1 : 0
  const pool = [...B]
  let hit = 0
  for (const g of A) {
    const i = pool.indexOf(g)
    if (i >= 0) { hit++; pool.splice(i, 1) }
  }
  return (2 * hit) / (A.length + B.length)
}

/**
 * 店舗名の一致度
 *   full : 店舗名の全体がそのまま含まれる → 0.98
 *   token: 3文字以上の語が含まれる → 0.85 + 0.1 × 含まれた語の文字数の割合（2文字の語のみなら 0.7）
 *   fuzzy: どれにも当たらなければ文字の並びの類似度（最大0.8）
 */
function nameScore(text: string, company: string): { score: number; full: boolean } {
  const t = normalize(text)
  if (!t) return { score: 0, full: false }
  if (fullNames(company).some((n) => n.length >= 3 && t.includes(n))) return { score: 0.98, full: true }
  const toks = tokens(company)
  const total = toks.reduce((a, x) => a + x.length, 0) || 1
  const hitLong = toks.filter((x) => x.length >= 3 && t.includes(x))
  if (hitLong.length) {
    const covered = hitLong.reduce((a, x) => a + x.length, 0)
    return { score: 0.85 + 0.1 * Math.min(1, covered / total), full: false }
  }
  if (toks.some((x) => x.length === 2 && t.includes(x))) return { score: 0.7, full: false }
  return { score: Math.max(...fullNames(company).map((n) => dice(t, n)), 0) * 0.8, full: false }
}

/** 純粋な判定関数（DBアクセスなし）。テストしやすいよう候補を引数で受ける */
export function decide(input: { fileName: string; body: string }, candidates: Candidate[]): Decision {
  const text = `${input.fileName}\n${input.body}`
  const qNo = text.match(/#?Q-(\d{1,7})/i)?.[1]
  const rpTo = input.body.match(/\[rp aid=\d+ to=\d+-(\d+)\]/)?.[1]

  const full = new Set<number>()
  const scored = candidates.map((c) => {
    if (qNo && Number(qNo) === c.quote_request_id) { full.add(c.quote_request_id); return { ...c, score: 1, reason: `依頼番号 #Q-${qNo} が一致` } }
    if (rpTo && c.chatwork_message_id === rpTo) { full.add(c.quote_request_id); return { ...c, score: 0.98, reason: '依頼メッセージへの返信' } }
    const byFile = nameScore(input.fileName, c.company_name)
    const byBody = nameScore(input.body, c.company_name)
    const best = byFile.score >= byBody.score * 0.95 ? byFile : { score: byBody.score * 0.95, full: byBody.full }
    let s = best.score
    if (best.full) full.add(c.quote_request_id)
    // 見積待ちでない依頼（作成済・提示済）への一致は、依頼なしの修正版の可能性があるため少し下げる
    if (!QUOTE_WAITING_STATUSES.includes(c.status)) s *= 0.9
    return { ...c, score: Math.round(s * 100) / 100, reason: s > 0 ? (best.full ? '店舗名が完全一致' : '店舗名の一部が一致') : '' }
  }).sort((a, b) => b.score - a.score)

  const [top, second] = scored
  const top3 = scored.filter((c) => c.score > 0.2).slice(0, 3)
  if (!top || top.score < 0.3) {
    return { decision: 'inbox', confidence: top?.score ?? 0, reason: '該当する見積依頼が見つからない', best: null, candidates: top3 }
  }
  // 2位と十分な差がある、または1位だけが完全一致（同じチェーンの別店舗との区別）なら自動
  const onlyTopFull = full.has(top.quote_request_id) && !(second && full.has(second.quote_request_id))
  const clear = top.score >= AUTO_THRESHOLD && (!second || top.score - second.score >= AUTO_MARGIN || onlyTopFull)
  return {
    decision: clear ? 'auto' : 'inbox',
    confidence: top.score,
    reason: clear ? top.reason : second && top.score - second.score < AUTO_MARGIN
      ? `候補が複数（${top.company_name} / ${second.company_name}）` : `一致が弱い（${top.company_name} ${Math.round(top.score * 100)}%）`,
    best: top,
    candidates: top3,
  }
}

