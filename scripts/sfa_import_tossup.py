"""
トスアップ管理表CSV → SFA取込SQL を生成する（DBには直接書き込まない）

使い方:
  python scripts/sfa_import_tossup.py <CSVパス> <出力ディレクトリ> [--batch 40]

出力:
  sfa_import_members.sql  … 対応担当メンバー（tendor）
  sfa_import_NN.sql       … 案件データ（batch件ごと）
  sfa_import_preview.json … 変換結果（目視確認用）

変換ルール（2026-10-13 合意）:
  - 1行 = 会社1・先方担当者1・案件1
  - トスアップコメント（定型）から 担当者名/携帯/メール/都合/関心度/利用中容器/ヒアリング を抽出
  - フィードバック欄の「M/D ...」を日付付き接触履歴に分解（日付なし行はメモ）
  - 結果 → stage: NG=失注 / 受注=受注 / 登録=会員登録 / 見積依頼=見積依頼(作成済なら見積作成済)
                   見積り中・検討=検討中 / 不在・詳細確認・メール依頼など=アポ獲得
  - 対応担当「鈴木」は「鈴木薫」に統合
  - 進行中案件は、文中の「M/D 再架電・確認・提示」等から次回タスクを1件作る
    （読めない／最終接触より前の日付しかない場合は作らない＝「次回未設定」として一覧に出す）
"""
import csv, sys, re, json, os, argparse, datetime

OWNER_ALIAS = {'鈴木': '鈴木薫'}
MEMBERS = ['meguli', '葛西', '大石', '佐藤', '鈴木薫']

LABELS = {
    'contact': r'担当者名[^：:\n]*[：:]',
    'best_time': r'都合のよい[^：:\n]*[：:]',
    'temperature': r'関心度[^：:\n]*[：:]',
    'mobile': r'携帯番号[：:]',
    'email': r'メールアドレス[：:]',
    'containers': r'(?:利用中容器|容器の型番)[^：:\n]*[：:]',
    'hearing': r'ヒアリングメモ[^：:\n]*[：:]',
}
NEXT_LABEL = r'(?=\n\s*(?:会社名|電話番号|携帯番号|メールアドレス|担当者名|都合のよい|先方の反応|利用中容器|容器の型番|ヒアリングメモ|月の使用量|購入場所|ケース購入)|\Z)'


def field(text, key):
    m = re.search(LABELS[key] + r'(.*?)' + NEXT_LABEL, text, re.S)
    if not m:
        return None
    v = re.sub(r'[ \t　]+', ' ', m.group(1)).strip()
    v = re.sub(r'^（任意）容器の悩み・関心事項があれば簡潔に(記録)?', '', v).strip()
    return v or None


def containers_block(text):
    """利用中容器〜ヒアリングメモの手前まで（使用量・購入場所・ケース可否も含める）"""
    m = re.search(LABELS['containers'] + r'(.*?)(?=\n\s*ヒアリングメモ|\Z)', text, re.S)
    if not m:
        return None
    v = re.sub(r'[ \t　]+', ' ', m.group(1)).strip()
    return v or None


def mkdate(base_y, base_m, mo, d):
    if not (1 <= mo <= 12 and 1 <= d <= 31):
        return None
    y = base_y + (1 if mo < base_m - 2 else 0)  # トスアップ月より大きく前の月は翌年扱い
    try:
        return datetime.date(y, mo, d).isoformat()
    except ValueError:
        return None


DATE_HEAD = re.compile(r'^(\d{1,2})/(\d{1,2})(?:\s*[（(][^)）]*[)）])?')
NOANSWER = re.compile(r'不在|コール音|留守|電波|取り込み中|出ず|出ない|忙し|手が離せ|別件|外出|いない|近くにいない|つながらない|繋がらない')


def classify(body):
    if re.search(r'見積.{0,4}(提示|提出|送付|送信|出し)|見積もりメール', body):
        return '見積提示'
    if '訪問' in body:
        return '訪問'
    if re.search(r'メール', body):
        return 'メール'
    if 'SMS' in body.upper():
        return 'SMS'
    if NOANSWER.search(body) and len(body) <= 40:
        return '不在'
    return '架電'


def activities(fb, base_y, base_m):
    out = []
    parts = re.split(r'\n|(?=(?<![\d/])\d{1,2}/\d{1,2}[ 　　（(])', fb or '')
    for i, line in enumerate(parts):
        line = line.strip(' 　　\t')
        if not line:
            continue
        m = DATE_HEAD.match(line)
        date = mkdate(base_y, base_m, int(m.group(1)), int(m.group(2))) if m else None
        if date:
            body = line[m.end():].strip(' 　　')
            out.append({'on': date, 'kind': classify(body), 'body': body or '（記載なし）'})
        else:
            out.append({'on': None, 'kind': 'メモ', 'body': line})
    return out


NEXT_RE = re.compile(r'(\d{1,2})/(\d{1,2})[^\n/]{0,14}?(再架電|架電|再度TEL|TEL|確認|連絡|提示|打診|訪問|予定)')


def next_task(texts, base_y, base_m):
    cands = []
    for t in texts:
        for m in NEXT_RE.finditer(t or ''):
            d = mkdate(base_y, base_m, int(m.group(1)), int(m.group(2)))
            if d:
                cands.append((d, m.group(3), t))
    return max(cands) if cands else None


def stage_of(result, progress):
    if result == 'NG':
        return '失注'
    if result == '受注':
        return '受注'
    if result == '登録':
        return '会員登録'
    if result == '見積依頼':
        return '見積作成済' if '作成済' in progress else '見積依頼'
    if result in ('見積り中', '検討'):
        return '検討中'
    return 'アポ獲得'


def task_kind(stage, word):
    if word == '訪問':
        return '訪問'
    if stage == '見積依頼':
        return '見積作成'
    if stage == '見積作成済' or word == '提示':
        return '見積提示'
    if stage == '検討中':
        return '回答確認'
    return '再架電'


def norm_temp(v):
    if not v:
        return None
    for t in ('高', '中', '低'):
        if v.startswith(t):
            return t
    return None


def q(v):
    if v is None or v == '':
        return 'null'
    return "'" + str(v).replace("'", "''") + "'"


def convert(rows):
    recs = []
    for idx, r in enumerate(rows, 1):
        r = (r + [''] * 14)[:14]
        name = r[3].strip()
        toss = r[4].strip().replace('/', '-') or None
        base = datetime.date.fromisoformat(toss) if toss else datetime.date.today()
        c = r[7]
        result, progress = r[9].strip(), r[11].strip()
        owner = OWNER_ALIAS.get(r[8].strip(), r[8].strip()) or None
        stage = stage_of(result, progress)
        acts = activities(r[10], base.year, base.month)
        dated = [a['on'] for a in acts if a['on']]
        rec = {
            'row': idx, 'no': r[1].strip() or None, 'kind': r[2].strip() or None,
            'company': {'name': name, 'phone': r[6].strip() or None, 'address': r[5].strip() or None},
            'contact': {
                'name': field(c, 'contact'), 'mobile': field(c, 'mobile'),
                'email': field(c, 'email'), 'best_time': field(c, 'best_time'),
            },
            'deal': {
                'stage': stage, 'temperature': norm_temp(field(c, 'temperature')), 'owner': owner,
                'tossed_at': toss, 'hearing': field(c, 'hearing'),
                'containers': containers_block(c),
                'considering': progress or None,
                'lost_reason': (r[10].strip()[:500] or None) if stage == '失注' else None,
                'closed_on': (max(dated) if dated else toss) if stage in ('受注', '失注') else None,
                'legacy': {'結果': result, '種別': r[2].strip(), '進捗最新': progress,
                           'ネクストアクション': r[12].strip(), 'トスアップコメント': c, 'フィードバック': r[10]},
            },
            'activities': acts,
            'task': None, 'quote_request': None,
        }
        if stage not in ('受注', '失注'):
            nt = next_task([r[12], progress, r[10]], base.year, base.month)
            # 最終接触より前の日付は「その後も対応が続いた過去の予定」なので採用しない
            if nt and (not dated or nt[0] >= max(dated)):
                rec['task'] = {'due_on': nt[0], 'kind': task_kind(stage, nt[1]),
                               'note': r[12].strip() or f'取込時に推定（{nt[1]}）'}
        if stage in ('見積依頼', '見積作成済'):
            st = '作成済' if stage == '見積作成済' else ('作成中' if '作成中' in progress else '依頼中')
            rec['quote_request'] = {'status': st, 'note': '取込: ' + (progress or result)}
        recs.append(rec)
    return recs


def member(name):
    return f"(select id from public.sfa_members where name = {q(name)})" if name else 'null'


def to_sql(rec):
    co, ct, d = rec['company'], rec['contact'], rec['deal']
    s = []
    s.append(f"with c as (insert into public.sfa_companies (name, phone, address) values ({q(co['name'])}, {q(co['phone'])}, {q(co['address'])}) returning id)")
    s.append(f", ct as (insert into public.sfa_contacts (company_id, name, mobile, email, best_time) select id, {q(ct['name'])}, {q(ct['mobile'])}, {q(ct['email'])}, {q(ct['best_time'])} from c returning id, company_id)")
    closed = f"{q(d['closed_on'])}::timestamptz" if d['closed_on'] else 'null'
    s.append(
        ", d as (insert into public.sfa_deals (company_id, contact_id, stage, temperature, owner_id, tossed_at, hearing,"
        " current_containers_text, considering, lost_reason, closed_at, stage_changed_at, legacy_no, legacy)"
        f" select ct.company_id, ct.id, {q(d['stage'])}, {q(d['temperature'])}, {member(d['owner'])}, {q(d['tossed_at'])}::date,"
        f" {q(d['hearing'])}, {q(d['containers'])}, {q(d['considering'])}, {q(d['lost_reason'])}, {closed},"
        f" coalesce({closed}, now()), {q(rec['no'])}, {q(json.dumps(d['legacy'], ensure_ascii=False))}::jsonb from ct returning id)"
    )
    if rec['activities']:
        vals = ', '.join(
            f"({q(a['on'])}::date, {q(a['kind'])}, {q(a['body'])}, {i})" for i, a in enumerate(rec['activities'])
        )
        s.append(f", a as (insert into public.sfa_activities (deal_id, occurred_on, kind, body, member_id, source, seq)"
                 f" select d.id, v.on_, v.kind, v.body, {member(d['owner'])}, 'import', v.seq from d, (values {vals}) as v(on_, kind, body, seq))")
    if rec['task']:
        t = rec['task']
        s.append(f", t as (insert into public.sfa_tasks (deal_id, due_on, kind, note, assignee_id)"
                 f" select d.id, {q(t['due_on'])}::date, {q(t['kind'])}, {q(t['note'])}, {member(d['owner'])} from d)")
    if rec['quote_request']:
        qr = rec['quote_request']
        s.append(f", qr as (insert into public.sfa_quote_requests (deal_id, status, request_note, requested_at)"
                 f" select d.id, {q(qr['status'])}, {q(qr['note'])}, {q(d['tossed_at'])}::timestamptz from d)")
    s.append('select 1;')
    return '\n'.join(s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('csv')
    ap.add_argument('outdir')
    ap.add_argument('--batch', type=int, default=40)
    a = ap.parse_args()
    with open(a.csv, encoding='utf-8-sig', newline='') as f:
        rows = [r for r in list(csv.reader(f))[2:] if len(r) > 3 and r[3].strip()]
    recs = convert(rows)
    os.makedirs(a.outdir, exist_ok=True)
    with open(os.path.join(a.outdir, 'sfa_import_preview.json'), 'w', encoding='utf-8') as f:
        json.dump(recs, f, ensure_ascii=False, indent=1)
    with open(os.path.join(a.outdir, 'sfa_import_members.sql'), 'w', encoding='utf-8') as f:
        # 「meguli」はmeguli側テレアポ担当の総称。個人メンバー登録後に案件を付け替える
        f.write('insert into public.sfa_members (name, org, role) values '
                + ', '.join(f"({q(m)}, {q('meguli' if m == 'meguli' else 'tendor')}, 'admin')" for m in MEMBERS)
                + ' on conflict (name) do nothing;\n')
    for i in range(0, len(recs), a.batch):
        with open(os.path.join(a.outdir, f'sfa_import_{i // a.batch + 1:02d}.sql'), 'w', encoding='utf-8') as f:
            f.write('\n\n'.join(to_sql(r) for r in recs[i:i + a.batch]) + '\n')
    print(f'{len(recs)} records -> {a.outdir}')


if __name__ == '__main__':
    main()
