-- 見積書の中身（明細）を持つ
--   見積書ファイル（版）ごとに、PDFから読み取ったヘッダ情報と明細行を保存する
--   保存するのはお客様に提示した価格だけ（原価は持たない。外部営業もSFAを見るため）

alter table public.sfa_quote_files
  add column parse_status text not null default 'none'
    check (parse_status in ('none', 'parsed', 'needs_review', 'failed', 'confirmed')),
  add column parse_note text,               -- 要確認・失敗の理由
  add column quote_no text,                 -- 見積番号（例: 261020-006[001]）
  add column issued_on date,                -- 作成日
  add column addressee text,                -- 宛名（例: シスターズカレー 御中）
  add column addressee_person text,         -- 宛名の担当者（例: バンダリ 様）
  add column issuer_person text,            -- テンドール担当（例: 葛西 健一郎）
  add column total_amount numeric,          -- 金額合計（税抜）
  add column valid_note text,               -- 有効期限の記載
  add column remarks text,                  -- 備考（送料条件など）
  add column parsed_at timestamptz,
  add column confirmed_by_id bigint references public.sfa_members(id),
  add column confirmed_at timestamptz;

create table public.sfa_quote_lines (
  id bigint generated always as identity primary key,
  quote_file_id bigint not null references public.sfa_quote_files(id) on delete cascade,
  line_no int not null,
  code text,                                -- コード欄（容器なびの商品コード等。空のことが多い）
  product text not null,                    -- 商品名・摘要
  qty numeric,                              -- 入数（＝見積数量）
  unit_price numeric,                       -- 単価（円・税抜）
  amount numeric,                           -- 金額（円・税抜）
  check_ok boolean,                         -- 入数×単価=金額 の検算結果
  created_at timestamptz not null default now(),
  unique (quote_file_id, line_no)
);
create index sfa_quote_lines_file_idx on public.sfa_quote_lines (quote_file_id);

alter table public.sfa_quote_lines enable row level security;
