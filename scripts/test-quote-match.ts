/** 見積書照合ルールの確認: npx tsx scripts/test-quote-match.ts（全件OKであること） */
import { decide, normalize, type Candidate } from '../src/lib/sfa/quote-match'

const c = (id: number, name: string, status: Candidate['status'] = '依頼中', msg: string | null = null): Candidate =>
  ({ quote_request_id: id, deal_id: id, company_name: name, status, chatwork_message_id: msg, score: 0, reason: '' })

const cands = [
  c(101, 'やっ家 Yakke'),
  c(102, '焼き小籠包専門店　弄堂生煎饅頭　南森町本店　ロンタンセンチェンマントウ'),
  c(103, '麺場 浜虎（メンバ・ハマトラ）', '修正依頼'),
  c(104, 'からあげ金と銀 熊取大久保南店'),
  c(105, 'からあげ金と銀 泉佐野店'),
  c(106, 'リザキッチン', '提示済', '99887766'),
]

const cases: Array<[string, string, number | null]> = [
  ['御見積書_やっ家様_20261014.pdf', '', 101],
  ['見積書（弄堂生煎饅頭様）.pdf', '', 102],
  ['ハマトラ様 見積 修正版.pdf', '', 103],
  ['麺場浜虎様_見積書v2.pdf', '', 103],
  ['からあげ金と銀様.pdf', '', null], // 2店舗あるので仕分け待ち
  ['からあげ金と銀 熊取大久保南店様.pdf', '', 104],
  ['見積書.pdf', '#Q-105 の件です', 105],
  ['見積書.pdf', '[rp aid=1 to=123-99887766] 修正しました', 106],
  ['御見積書_1013.pdf', '', null],
  ['リザキッチン様御見積.pdf', '', 106],
]

let ok = 0
for (const [file, body, expect] of cases) {
  const d = decide({ fileName: file, body }, cands)
  const got = d.decision === 'auto' ? d.best!.quote_request_id : null
  const pass = got === expect
  if (pass) ok++
  console.log(`${pass ? 'OK ' : 'NG '} ${file} | ${body} -> ${d.decision} ${got ?? ''} conf=${d.confidence} (${d.reason}) top=${d.candidates.map((x) => `${x.quote_request_id}:${x.score}`).join(',')}`)
}
console.log(`${ok}/${cases.length}`, normalize('御見積書_やっ家様_20261014.pdf'))
