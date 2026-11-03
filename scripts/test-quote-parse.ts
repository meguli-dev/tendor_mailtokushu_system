/**
 * 見積書PDF読み取りの確認（DB不要）
 *   npx tsx scripts/test-quote-parse.ts <見積書.pdf> [...]
 */
import { readFileSync } from 'node:fs'
import { parseQuotePdf } from '../src/lib/sfa/quote-parse'

async function main() {
  const files = process.argv.slice(2)
  if (!files.length) throw new Error('PDFのパスを指定してください')
  for (const f of files) {
    const r = await parseQuotePdf(readFileSync(f))
    console.log(`\n=== ${f}\n${r.status}${r.note ? `（${r.note}）` : ''}`)
    console.log({ ...r, lines: undefined })
    console.table(r.lines)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
