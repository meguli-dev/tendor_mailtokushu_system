-- SFA（テレアポ→商談→見積管理）モジュール
-- 適用先: SCOS共通DB（swuvefajjpdwmdrvtkhh）。public.tenants / auth.users を参照する
-- 方針:
--   - テーブルは public.sfa_* に置き、RLS有効・ポリシーなし（anon/authenticatedからは不可視）
--   - 読み書きはすべてVercelのサーバー側（service role）経由。SFA内の権限判定はアプリ側で sfa_members を見る
--   - 案件データは tenant_id（SFAの持ち主テナント＝テンドール物流）で区切る
--   - 次回予定は案件に1つ持つのではなく sfa_tasks（完了日時付き）で持ち、「期限超過で未実行」を判定可能にする

-- =============================================================
-- メンバー
--   tenant_id: 所属会社（テンドール物流＝見積作成側 / 株式会社meguli＝テレアポ・見積提示側）
--   role     : admin = 全機能 / sales = SFAのみ（原価・見積りAI・メルマガは不可）
--   見積書ルームでは、案件の持ち主テナントに所属するメンバーが投稿したPDFだけを見積書として取り込む
--   auth_user_id が無いメンバー（ログイン未発行の担当者）も担当者として登録できる
--   SFAにアクセスできるのは sfa_members に登録されたユーザーのみ（SCOS共通DBのため他アプリのユーザーを入れない）
-- =============================================================
create table public.sfa_members (
  id bigint generated always as identity primary key,
  name text not null unique,
  tenant_id uuid not null references public.tenants(id),
  role text not null default 'sales' check (role in ('admin', 'sales')),
  email text unique,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  chatwork_account_id text,           -- [To:xxxx] 用
  chatwork_room_id text,              -- 個別通知先
  mcp_key_hash text unique,           -- 個人MCPキーのsha256（平文は保存しない）
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =============================================================
-- 会社（店舗）・先方担当者
-- =============================================================
create table public.sfa_companies (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id),
  name text not null,
  phone text,
  address text,
  industry text,
  website text,
  bcart_customer_id text,             -- 容器なび会員登録後に任意で紐付け
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sfa_companies_name_idx on public.sfa_companies using gin (name extensions.gin_trgm_ops);
create index sfa_companies_phone_idx on public.sfa_companies (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'));
create index on public.sfa_companies (tenant_id);

create table public.sfa_contacts (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.sfa_companies(id) on delete cascade,
  name text,
  position text,
  phone text,
  mobile text,
  email text,
  best_time text,                     -- 連絡のつきやすい曜日・時間帯
  memo text,
  created_at timestamptz not null default now()
);
create index on public.sfa_contacts (company_id);

-- =============================================================
-- 案件
--   stage: アポ獲得 → 見積依頼 → 見積作成済 → 検討中（提示済） → 会員登録 → 受注 / 長期検討 / 失注
-- =============================================================
create table public.sfa_deals (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id),
  company_id bigint not null references public.sfa_companies(id) on delete cascade,
  contact_id bigint references public.sfa_contacts(id) on delete set null,
  title text,
  stage text not null default 'アポ獲得'
    check (stage in ('アポ獲得', '見積依頼', '見積作成済', '検討中', '会員登録', '受注', '長期検討', '失注')),
  temperature text check (temperature in ('高', '中', '低')),
  owner_id bigint references public.sfa_members(id),        -- 対応担当（見積提示・追客する人）
  tossed_by_id bigint references public.sfa_members(id),    -- アポ獲得者（テレアポ）
  tossed_by_name text,                                        -- メンバー未登録のアポ獲得者名
  tossed_at date,                                             -- アポ獲得日（トスアップ日）
  appointment_note text,                                      -- アポ時の希望日時など
  hearing text,                                               -- アポ時ヒアリング
  current_containers_text text,                               -- 使用中容器（自由記述の原文）
  considering text,                                           -- 何を検討しているか
  answer_due date,                                            -- 回答予定日
  lost_reason text,
  stage_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  legacy_no text,                                             -- トスアップ管理表のNo
  legacy jsonb,                                               -- 取込元の原文（コメント・フィードバック等）
  created_by_id bigint references public.sfa_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.sfa_deals (tenant_id, stage);
create index on public.sfa_deals (company_id);
create index on public.sfa_deals (owner_id);

-- 使用中容器（構造化）。原文は sfa_deals.current_containers_text
create table public.sfa_deal_containers (
  id bigint generated always as identity primary key,
  deal_id bigint not null references public.sfa_deals(id) on delete cascade,
  product text not null,              -- 品名・型番（顧客の言い方）
  maker text,
  supplier text,                      -- 現在の仕入先
  unit_price numeric,                 -- 現在単価（円/枚、税抜に正規化）
  price_note text,                    -- 価格の原文（「50枚で◯円」等）
  monthly_qty text,
  cost_master_code text,              -- 見積りAIの原価マスタとの紐付け
  memo text,
  created_at timestamptz not null default now()
);
create index on public.sfa_deal_containers (deal_id);

-- =============================================================
-- 接触履歴
-- =============================================================
create table public.sfa_activities (
  id bigint generated always as identity primary key,
  deal_id bigint not null references public.sfa_deals(id) on delete cascade,
  occurred_on date,                   -- 日付不明の取込履歴は null
  occurred_at timestamptz,
  kind text not null default 'メモ'
    check (kind in ('架電', '不在', '商談', '訪問', '見積提示', 'メール', 'SMS', 'ステータス変更', 'メモ')),
  body text,
  member_id bigint references public.sfa_members(id),
  source text not null default 'ui' check (source in ('ui', 'mcp', 'import', 'system')),
  seq int not null default 0,         -- 同日内の並び順（取込時）
  created_at timestamptz not null default now()
);
create index on public.sfa_activities (deal_id, occurred_on);

-- =============================================================
-- 次のアクション（タスク）
-- =============================================================
create table public.sfa_tasks (
  id bigint generated always as identity primary key,
  deal_id bigint not null references public.sfa_deals(id) on delete cascade,
  due_on date not null,
  due_time time,
  kind text not null default '再架電'
    check (kind in ('再架電', '見積作成', '見積提示', '回答確認', '再アプローチ', '訪問', 'その他')),
  note text,
  assignee_id bigint references public.sfa_members(id),
  done_at timestamptz,
  done_by_id bigint references public.sfa_members(id),
  created_by_id bigint references public.sfa_members(id),
  created_at timestamptz not null default now()
);
create index sfa_tasks_open_idx on public.sfa_tasks (due_on) where done_at is null;
create index on public.sfa_tasks (deal_id);

-- =============================================================
-- 見積依頼・見積書（版管理）
-- =============================================================
create table public.sfa_quote_requests (
  id bigint generated always as identity primary key,
  deal_id bigint not null references public.sfa_deals(id) on delete cascade,
  status text not null default '依頼中'
    check (status in ('依頼中', '作成中', '作成済', '修正依頼', '提示済', '取消')),
  request_note text,                  -- 依頼内容（対象容器・数量・条件）
  due_on date,
  requested_by_id bigint references public.sfa_members(id),
  requested_at timestamptz not null default now(),
  chatwork_message_id text,           -- 依頼をルームに投稿したときのメッセージID
  updated_at timestamptz not null default now()
);
create index on public.sfa_quote_requests (deal_id);
create index on public.sfa_quote_requests (status);

create table public.sfa_quote_files (
  id bigint generated always as identity primary key,
  quote_request_id bigint not null references public.sfa_quote_requests(id) on delete cascade,
  version int not null,
  storage_key text not null,          -- R2のキー
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  note text,                          -- 修正内容など
  uploaded_by_id bigint references public.sfa_members(id),
  uploaded_at timestamptz not null default now(),
  source text not null default 'ui' check (source in ('ui', 'mcp', 'chatwork')),
  chatwork_file_id text unique,       -- 二重取込防止
  unique (quote_request_id, version)
);

-- =============================================================
-- Chatwork見積書ルームの取込ログ（判定ログ兼「仕分け待ち」）
--   decision: auto = 自動紐付け / inbox = 仕分け待ち / ignored = 対象外 / resolved = 人が確定
-- =============================================================
create table public.sfa_chatwork_inbox (
  id bigint generated always as identity primary key,
  room_id text not null,
  message_id text not null,
  file_id text,
  account_id text,                    -- 投稿者のChatwork account_id
  account_name text,
  file_name text,
  body text,
  decision text not null check (decision in ('auto', 'inbox', 'ignored', 'resolved')),
  reason text,                        -- 判定根拠（依頼番号一致／店舗名一致／投稿者がテンドール外 等）
  confidence numeric,
  candidates jsonb,                   -- [{quote_request_id, company_name, score}]
  quote_request_id bigint references public.sfa_quote_requests(id) on delete set null,
  quote_file_id bigint references public.sfa_quote_files(id) on delete set null,
  resolved_by_id bigint references public.sfa_members(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id, file_id)
);
create index sfa_chatwork_inbox_pending_idx on public.sfa_chatwork_inbox (created_at) where decision = 'inbox';

-- =============================================================
-- updated_at トリガー（既存の update_updated_at_column を流用）
-- =============================================================
create trigger sfa_companies_updated_at before update on public.sfa_companies
  for each row execute function public.update_updated_at_column();
create trigger sfa_deals_updated_at before update on public.sfa_deals
  for each row execute function public.update_updated_at_column();
create trigger sfa_quote_requests_updated_at before update on public.sfa_quote_requests
  for each row execute function public.update_updated_at_column();

-- =============================================================
-- RLS: 有効化のみ（ポリシーなし = service role 以外アクセス不可）
-- =============================================================
alter table public.sfa_members enable row level security;
alter table public.sfa_companies enable row level security;
alter table public.sfa_contacts enable row level security;
alter table public.sfa_deals enable row level security;
alter table public.sfa_deal_containers enable row level security;
alter table public.sfa_activities enable row level security;
alter table public.sfa_tasks enable row level security;
alter table public.sfa_quote_requests enable row level security;
alter table public.sfa_quote_files enable row level security;
alter table public.sfa_chatwork_inbox enable row level security;

revoke all on public.sfa_members, public.sfa_companies, public.sfa_contacts, public.sfa_deals,
  public.sfa_deal_containers, public.sfa_activities, public.sfa_tasks,
  public.sfa_quote_requests, public.sfa_quote_files, public.sfa_chatwork_inbox
  from anon, authenticated;

-- =============================================================
-- ビュー: 案件一覧（次のタスク・最終接触を付与）
--   今日/期限切れ/次回未設定 は next_due_on と is_open から判定する
-- =============================================================
create view public.sfa_deal_overview
with (security_invoker = true) as
select
  d.id, d.tenant_id, d.company_id, c.name as company_name, c.phone, d.stage, d.temperature,
  d.owner_id, o.name as owner_name, d.tossed_at, d.tossed_by_name,
  d.considering, d.answer_due, d.updated_at,
  ct.name as contact_name, ct.mobile as contact_mobile, ct.best_time,
  nt.id as next_task_id, nt.due_on as next_due_on, nt.kind as next_kind, nt.note as next_note,
  la.occurred_on as last_contact_on, la.body as last_contact_body,
  (d.stage not in ('受注', '失注')) as is_open
from public.sfa_deals d
join public.sfa_companies c on c.id = d.company_id
left join public.sfa_contacts ct on ct.id = d.contact_id
left join public.sfa_members o on o.id = d.owner_id
left join lateral (
  select t.* from public.sfa_tasks t
  where t.deal_id = d.id and t.done_at is null
  order by t.due_on, t.due_time nulls last limit 1
) nt on true
left join lateral (
  select a.* from public.sfa_activities a
  where a.deal_id = d.id and a.occurred_on is not null
  order by a.occurred_on desc, a.seq desc limit 1
) la on true;

revoke all on public.sfa_deal_overview from anon, authenticated;
