-- 見積もりエンジン（容器なび営業支援）: youkinavi スキーマ
-- 設計書: 02_Decisions/テンドール_デジタル基盤_設計書_v2.md §3

create extension if not exists pg_trgm;

create schema if not exists youkinavi;

-- =============================================================
-- 正規化キー関数
-- 仕様（GAS取込用_追加4シート.xlsx の正規化キー4,470件と完全一致を確認済み）:
--   1. 半角カナ→全角カナ（濁点合成含む）
--   2. 全角英数記号（！-～）→半角
--   3. 空白（全角含む）除去
--   4. ハイフン類・長音（ー/ｰ）除去
--   5. 英字は大文字化
--   ※ ①⑨ⅡⅢ・中点（・）は保持する
-- =============================================================
create or replace function youkinavi.norm_key(input text)
returns text
language plpgsql immutable
as $$
declare
  s text := coalesce(input, '');
begin
  -- 半角カナ 濁点・半濁点の合成
  s := replace(s, 'ｶﾞ', 'ガ'); s := replace(s, 'ｷﾞ', 'ギ'); s := replace(s, 'ｸﾞ', 'グ');
  s := replace(s, 'ｹﾞ', 'ゲ'); s := replace(s, 'ｺﾞ', 'ゴ'); s := replace(s, 'ｻﾞ', 'ザ');
  s := replace(s, 'ｼﾞ', 'ジ'); s := replace(s, 'ｽﾞ', 'ズ'); s := replace(s, 'ｾﾞ', 'ゼ');
  s := replace(s, 'ｿﾞ', 'ゾ'); s := replace(s, 'ﾀﾞ', 'ダ'); s := replace(s, 'ﾁﾞ', 'ヂ');
  s := replace(s, 'ﾂﾞ', 'ヅ'); s := replace(s, 'ﾃﾞ', 'デ'); s := replace(s, 'ﾄﾞ', 'ド');
  s := replace(s, 'ﾊﾞ', 'バ'); s := replace(s, 'ﾋﾞ', 'ビ'); s := replace(s, 'ﾌﾞ', 'ブ');
  s := replace(s, 'ﾍﾞ', 'ベ'); s := replace(s, 'ﾎﾞ', 'ボ'); s := replace(s, 'ﾊﾟ', 'パ');
  s := replace(s, 'ﾋﾟ', 'ピ'); s := replace(s, 'ﾌﾟ', 'プ'); s := replace(s, 'ﾍﾟ', 'ペ');
  s := replace(s, 'ﾎﾟ', 'ポ'); s := replace(s, 'ｳﾞ', 'ヴ');
  -- 半角カナ単体→全角
  s := translate(s,
    'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝｧｨｩｪｫｬｭｮｯ｡｢｣､･',
    'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンァィゥェォャュョッ。「」、・');
  -- 全角英数記号（U+FF01〜U+FF5E）→半角ASCII
  s := (
    select coalesce(string_agg(
      case when ascii(ch) between 65281 and 65374 then chr(ascii(ch) - 65248) else ch end,
      '' order by ord), '')
    from regexp_split_to_table(s, '') with ordinality as t(ch, ord)
  );
  -- 空白除去（半角・全角）
  s := regexp_replace(s, '[[:space:]　]', '', 'g');
  -- ハイフン類・長音除去
  s := regexp_replace(s, '[-‐‑–—−ｰー]', '', 'g');
  return upper(s);
end;
$$;

-- =============================================================
-- テーブル
-- =============================================================

-- メーカーマスタ（36社）
create table youkinavi.makers (
  id text primary key,                -- M001..M036
  name text not null,
  unit text,                          -- 運賃単位（ケース等）
  freight_fee numeric,                -- 基本運賃(円/単位)
  motobarai text,                     -- 元払い条件（原文）
  motobarai_cases int,                -- 元払い条件のケース数（パース値、判定用）
  qty_rule text,                      -- 数量帯の特則
  region_rule text,                   -- 地域の特則
  note text,
  buy_route text,                     -- 仕入経由
  price_apply_from text,              -- 新価格適用開始
  needs_check boolean not null default false, -- 要確認リスト該当
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 仕入原価マスタ（4,470品）※社外秘
create table youkinavi.cost_master (
  id bigint generated always as identity primary key,
  maker_id text references youkinavi.makers(id),
  maker_name text,
  code text,
  name text not null,
  name_key text generated always as (youkinavi.norm_key(name)) stored,
  material text,
  nyusu int,                          -- 入数
  price_old numeric,                  -- 旧単価
  price_new numeric,                  -- 新単価(改定後) ※社外秘
  kaitei_rate numeric,                -- 改定率
  status text,                        -- 改定/再見積/廃番/新規登録…
  t_mm numeric, y_mm numeric, h_mm numeric, dia_mm numeric, weight_g numeric,
  jisseki numeric,                    -- 年間実績
  last_sale_at date,
  freight_fee_row numeric,            -- 行単位の直送運賃(円/cs)
  motobarai_row text,                 -- 行単位の元払い条件
  note text,
  source text,                        -- 出典
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cost_master_name_key_trgm on youkinavi.cost_master using gin (name_key gin_trgm_ops);
create index cost_master_name_key_idx on youkinavi.cost_master (name_key);
create index cost_master_code_idx on youkinavi.cost_master (code);

-- 容器なび商品DB（Bcart APIから同期、約16,935 SKU）
create table youkinavi.bcart_products (
  id bigint primary key,              -- Bcart product id
  set_id bigint,
  name text,
  name_key text generated always as (youkinavi.norm_key(name)) stored,
  set_name text,
  code text,                          -- 型番
  color text,
  unit text,                          -- ケース/バラ
  unit_price numeric,                 -- 単価(1枚)
  nyusu int,
  case_price numeric,
  category text,
  kubun text,                         -- 通常/専用
  display boolean,
  raw jsonb,                          -- API応答の原本
  synced_at timestamptz not null default now()
);
create index bcart_products_name_key_trgm on youkinavi.bcart_products using gin (name_key gin_trgm_ops);
create index bcart_products_name_key_idx on youkinavi.bcart_products (name_key);

-- 都道府県別自社タリフ（西濃/福山の高い方を採用）
create table youkinavi.pref_freight (
  pref text primary key,
  region text,
  p_2kg numeric, s_5kg numeric, m_10kg numeric, l_20kg numeric
);

-- 地域・特殊運賃の特則
create table youkinavi.maker_freight_rules (
  id bigint generated always as identity primary key,
  rule_type text,                     -- 地域運賃/特殊 等
  maker_name text,
  condition text,
  freight text,
  source_set_ids text,
  jisseki text,
  note text
);

-- 設定
create table youkinavi.settings (
  key text primary key,
  value numeric not null,
  description text,
  updated_at timestamptz not null default now()
);

-- 価格更新履歴（全書き込み操作を記録）
create table youkinavi.price_history (
  id bigint generated always as identity primary key,
  cost_master_id bigint,
  code text,
  name text,
  old_price numeric,
  new_price numeric,
  action text not null,               -- create/update/discontinue
  operator text not null,             -- 操作者名（必須）
  source text,
  created_at timestamptz not null default now()
);

-- =============================================================
-- RLS: youkinaviスキーマはAPI層（service role / SECURITY DEFINER RPC）経由のみ。
-- ポリシーを定義しない = anon/authenticatedの直接アクセスは全拒否。
-- =============================================================
alter table youkinavi.makers enable row level security;
alter table youkinavi.cost_master enable row level security;
alter table youkinavi.bcart_products enable row level security;
alter table youkinavi.pref_freight enable row level security;
alter table youkinavi.maker_freight_rules enable row level security;
alter table youkinavi.settings enable row level security;
alter table youkinavi.price_history enable row level security;

-- updated_at 自動更新
create or replace function youkinavi.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger makers_updated_at before update on youkinavi.makers
  for each row execute function youkinavi.set_updated_at();
create trigger cost_master_updated_at before update on youkinavi.cost_master
  for each row execute function youkinavi.set_updated_at();
