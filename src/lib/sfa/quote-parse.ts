/**
 * 見積書PDFの読み取り（テンドールの見積書書式＝TCPDF出力の文字入りPDF）
 *   AIは使わず、決まった書式から項目を取り出す。各行の「入数×単価=金額」と「明細合計=金額合計」を検算し、
 *   合わないものは needs_review（要確認）にする。読み取りの失敗で見積書の保存は止めない。
 */
import { extractText, getDocumentProxy } from 'unpdf'

export interface ParsedQuoteLine {
  line_no: number
  code: string | null
  product: string
  qty: number | null
  unit_price: number | null
  amount: number | null
  check_ok: boolean
}

export interface ParsedQuote {
  status: 'parsed' | 'needs_review' | 'failed'
  note: string | null
  quote_no: string | null
  issued_on: string | null
  addressee: string | null
  addressee_person: string | null
  issuer_person: string | null
  total_amount: number | null
  valid_note: string | null
  remarks: string | null
  lines: ParsedQuoteLine[]
}

const num = (s: string | undefined) => (s === undefined ? null : Number(s.replace(/,/g, '')))
const pick = (text: string, re: RegExp) => text.match(re)?.[1]?.trim() || null

/** NFKCでは直らない部首補助の文字（例: 葛⻄ → 葛西） */
const RADICALS: Record<string, string> = {
  '⺟': '母', '⺠': '民', '⻁': '虎', '⻄': '西', '⻑': '長', '⻘': '青', '⻝': '食', '⻤': '鬼', '⻩': '黄', '⻭': '歯', '⻯': '竜', '⻲': '亀',
}

/** 明細行: 「No 商品名・摘要 入数 単価 金額」 */
const LINE_RE = /^(\d{1,3})\s+(.+?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(-?[\d,]+)$/

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}

export function parseQuoteText(raw: string): ParsedQuote {
  // PDFの文字は「⾒（康熙部首）」のような互換文字で入っているので NFKC で通常の文字にそろえる
  const text = raw.normalize('NFKC').replace(/[⺟⺠⻁⻄⻑⻘⻝⻤⻩⻭⻯⻲]/g, (c) => RADICALS[c] ?? c).replace(/\r/g, '')
  const rows = text.split('\n').map((l) => l.replace(/[ \t　]+/g, ' ').trim()).filter(Boolean)

  const lines: ParsedQuoteLine[] = []
  for (const row of rows) {
    const m = row.match(LINE_RE)
    if (!m) continue
    const qty = num(m[3]), unit = num(m[4]), amount = num(m[5])
    const check_ok = qty !== null && unit !== null && amount !== null && Math.abs(Math.round(qty * unit) - amount) <= 1
    lines.push({ line_no: lines.length + 1, code: null, product: m[2], qty, unit_price: unit, amount, check_ok })
  }

  const issued = text.match(/作成日\s*(\d{4})年(\d{1,2})月(\d{1,2})日/)
  const total = num(pick(text, /金\s*額\s*合\s*計\s*([\d,]+)/) ?? undefined)
  // 「運賃条件 別途記載（摘要・備考欄）」に引っかからないよう、行頭の「備 考」だけを見る
  const remarks = pick(text, /(?:^|\n)備\s*考\s*([\s\S]*?)(?:Powered by|\n\d+ \/ \d+|$)/)

  const result: ParsedQuote = {
    status: 'parsed',
    note: null,
    quote_no: pick(text, /No\.\s*([0-9A-Za-z\-[\]]+)/),
    issued_on: issued ? `${issued[1]}-${issued[2].padStart(2, '0')}-${issued[3].padStart(2, '0')}` : null,
    addressee: pick(text, /^(.+?)\s*御\s*中\s*$/m),
    addressee_person: pick(text, /^(.+?)\s*様\s*$/m),
    issuer_person: pick(text, /担当[:：]\s*(.+?)\s*$/m),
    total_amount: total,
    valid_note: pick(text, /有\s*効\s*期\s*限\s*(.+?)\s*$/m),
    remarks: remarks ? remarks.replace(/\s+/g, ' ').trim() : null,
    lines,
  }

  const problems: string[] = []
  if (!lines.length) problems.push('明細行を読み取れませんでした')
  const bad = lines.filter((l) => !l.check_ok).map((l) => l.line_no)
  if (bad.length) problems.push(`入数×単価と金額が合わない行: ${bad.join(', ')}`)
  const sum = lines.reduce((s, l) => s + (l.amount ?? 0), 0)
  if (lines.length && total !== null && Math.abs(sum - total) > 1) problems.push(`明細の合計（${sum.toLocaleString()}）と金額合計（${total.toLocaleString()}）が合いません`)
  if (lines.length && total === null) problems.push('金額合計を読み取れませんでした')

  if (!lines.length) result.status = 'failed'
  else if (problems.length) result.status = 'needs_review'
  result.note = problems.join('／') || null
  return result
}

export async function parseQuotePdf(buffer: Buffer): Promise<ParsedQuote> {
  const text = await extractPdfText(buffer)
  if (!text.trim()) {
    return { ...parseQuoteText(''), status: 'failed', note: 'PDFに文字データがありません（画像のPDF）' }
  }
  return parseQuoteText(text)
}
