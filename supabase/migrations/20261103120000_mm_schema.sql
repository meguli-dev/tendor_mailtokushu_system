-- メルマガ配信（Resend）: 設計書 01_Specs/メルマガ配信_Resend実装設計書.md v0.2
-- 適用先: SCOS共通DB（swuvefajjpdwmdrvtkhh）。public.tenants / auth.users / public.newsletters を参照する
--   - テーブルは public.mm_* に置き、RLS有効・ポリシーなし（anon/authenticatedからは不可視）
--   - 読み書きはすべてVercelのサーバー側（service role）経由
--   - 会員はこちらで常時保存しない。配信画面の「宛先を更新」でBカートから取得し、mm_deliveries に配信ごとに残す

-- 配信設定（テナントごとに1行）
create table public.mm_settings (
  tenant_id uuid primary key references public.tenants(id),
  excluded_view_group_ids int[] not null default '{1,2,4,5}',  -- 送らない閲覧グループ（退会・専用発注_002・専用（送料無料表記なし）・専用発注）
  from_name text not null default '容器なび',
  from_email text,                       -- null のときは環境変数 MAIL_FROM_EMAIL
  reply_to text,
  footer_html text,                      -- null のときは既定のフッター。{{UNSUBSCRIBE_URL}} を含めること
  test_recipients text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- 配信停止リスト（何があっても送らないアドレス。Bカートの受信フラグより優先）
create table public.mm_suppressions (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id),
  email text not null,                   -- lower() で保存
  reason text not null check (reason in ('unsubscribed', 'bounced', 'complained', 'manual')),
  campaign_id bigint,
  bcart_customer_id bigint,
  bcart_synced_at timestamptz,           -- Bカートへ mm_flag=0 を書き戻せた日時
  bcart_sync_error text,                 -- 失敗時。Cronで再試行
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

-- 配信（キャンペーン）
create table public.mm_campaigns (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id),
  newsletter_id uuid references public.newsletters(id) on delete set null,
  subject text not null,
  preheader text,
  greeting boolean not null default true, -- 冒頭に「{{会社名}} {{担当者名}} 様」を入れる
  html_snapshot text not null,           -- 配信を作った時点のHTML（後でメルマガを編集しても変わらない）
  status text not null default 'draft'
    check (status in ('draft', 'tested', 'scheduled', 'sending', 'sent', 'partial', 'canceled')),
  test_sent_at timestamptz,
  audience_refreshed_at timestamptz,     -- 「宛先を更新」でBカートから取得した日時
  audience_summary jsonb,                -- 対象件数・除外件数の内訳
  recipient_count int,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  worker_heartbeat_at timestamptz,       -- 送信ワーカーの生存確認（Cronが二重に動かさないため）
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.mm_campaigns (tenant_id, created_at desc);
create index on public.mm_campaigns (status, scheduled_at);

-- 宛先単位の送信記録（二重送信防止の要）
create table public.mm_deliveries (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references public.mm_campaigns(id) on delete cascade,
  bcart_customer_id bigint not null,
  email text not null,                   -- lower() で保存
  comp_name text,
  tanto_name text,
  view_group_id int,                     -- null = 通常会員
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped')),
  batch_no int,
  claimed_at timestamptz,
  resend_email_id text unique,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  first_opened_at timestamptz,
  open_count int not null default 0,
  first_clicked_at timestamptz,
  click_count int not null default 0,
  unsubscribed_at timestamptz,
  unique (campaign_id, email)
);
create index on public.mm_deliveries (campaign_id, status);

-- Webhookイベントの生ログ
create table public.mm_events (
  id bigint generated always as identity primary key,
  svix_id text not null unique,          -- Webhookの再送で二重計上しない
  resend_email_id text,
  delivery_id bigint references public.mm_deliveries(id) on delete set null,
  campaign_id bigint,
  type text not null,
  link_url text,
  occurred_at timestamptz not null,
  payload jsonb not null
);
create index on public.mm_events (campaign_id, type);

-- 送信ワーカー用: queued を最大 p_size 件 sending にして返す（並行実行しても取り合わない）
create or replace function public.mm_claim_batch(p_campaign_id bigint, p_size int, p_batch_no int)
returns setof public.mm_deliveries
language sql
as $$
  update public.mm_deliveries d
     set status = 'sending', batch_no = p_batch_no, claimed_at = now()
   where d.id in (
     select id from public.mm_deliveries
      where campaign_id = p_campaign_id and status = 'queued'
      order by id
      limit p_size
      for update skip locked
   )
  returning d.*;
$$;

-- Webhookの反映（カウンタを原子的に増やす）
create or replace function public.mm_apply_event(p_delivery_id bigint, p_type text, p_at timestamptz)
returns void
language sql
as $$
  update public.mm_deliveries set
    status = case
      when p_type = 'email.delivered' and status in ('sending', 'sent') then 'delivered'
      when p_type = 'email.bounced' then 'bounced'
      when p_type = 'email.complained' then 'complained'
      else status end,
    delivered_at = case when p_type = 'email.delivered' then coalesce(delivered_at, p_at) else delivered_at end,
    open_count = open_count + (p_type = 'email.opened')::int,
    first_opened_at = case when p_type = 'email.opened' then coalesce(first_opened_at, p_at) else first_opened_at end,
    click_count = click_count + (p_type = 'email.clicked')::int,
    first_clicked_at = case when p_type = 'email.clicked' then coalesce(first_clicked_at, p_at) else first_clicked_at end
  where id = p_delivery_id;
$$;

-- 配信ごとの集計
create or replace function public.mm_campaign_stats(p_campaign_id bigint)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'total', count(*),
    'queued', count(*) filter (where status = 'queued'),
    'sending', count(*) filter (where status = 'sending'),
    'sent', count(*) filter (where status in ('sent', 'delivered', 'bounced', 'complained')),
    'delivered', count(*) filter (where status = 'delivered' or delivered_at is not null),
    'bounced', count(*) filter (where status = 'bounced'),
    'complained', count(*) filter (where status = 'complained'),
    'failed', count(*) filter (where status = 'failed'),
    'skipped', count(*) filter (where status = 'skipped'),
    'opened', count(*) filter (where open_count > 0),
    'clicked', count(*) filter (where click_count > 0),
    'unsubscribed', count(*) filter (where unsubscribed_at is not null)
  )
  from public.mm_deliveries where campaign_id = p_campaign_id;
$$;

alter table public.mm_settings     enable row level security;
alter table public.mm_suppressions enable row level security;
alter table public.mm_campaigns    enable row level security;
alter table public.mm_deliveries   enable row level security;
alter table public.mm_events       enable row level security;
revoke all on public.mm_settings, public.mm_suppressions, public.mm_campaigns, public.mm_deliveries, public.mm_events from anon, authenticated;
revoke execute on function public.mm_claim_batch(bigint, int, int), public.mm_apply_event(bigint, text, timestamptz), public.mm_campaign_stats(bigint) from public, anon, authenticated;
