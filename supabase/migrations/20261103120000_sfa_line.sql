-- SFA × LINE公式アカウント（容器なび 顧客サポート @068yrczd）
-- 適用先: SCOS共通DB（swuvefajjpdwmdrvtkhh）
-- 方針:
--   - SFAはMessaging APIのWebhookを受けるだけ。顧客への返信はLINE公式アカウントのチャット画面で行う（SFAからLINEへは送信しない）
--   - 友だちは「未紐付け」で入り、管理画面またはMCPで案件に紐付ける（自動応答で店舗名は聞かない）
--   - 返信したかはAPIで取れないため、「未対応」は受信で立ち、担当者が「対応済」にするまで残る
--   - RLS有効・ポリシーなし（service role経由のみ）。sfa_* と同じ

-- =============================================================
-- LINEの友だち（＝顧客の1アカウント）
--   pending_since: 未対応になった時刻（最初の未返信メッセージ）。null なら対応済
-- =============================================================
create table public.sfa_line_users (
  id bigint generated always as identity primary key,
  line_user_id text not null unique,
  display_name text,
  picture_url text,
  status_message text,
  is_friend boolean not null default true,
  followed_at timestamptz,
  unfollowed_at timestamptz,
  deal_id bigint references public.sfa_deals(id) on delete set null,
  linked_at timestamptz,
  linked_by_id bigint references public.sfa_members(id),
  link_note text,                     -- 紐付けの根拠（「SMS招待の3分後に追加」等）
  last_message_at timestamptz,
  last_message_text text,
  pending_since timestamptz,
  notified_at timestamptz,            -- 最後にChatworkへ通知した時刻
  notify_count int not null default 0,
  notify_message_id text,             -- 最後の通知のChatworkメッセージID（「済」返信の照合用）
  handled_at timestamptz,
  handled_by_id bigint references public.sfa_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.sfa_line_users (deal_id);
create index sfa_line_users_unlinked_idx on public.sfa_line_users (followed_at) where deal_id is null;
create index sfa_line_users_pending_idx on public.sfa_line_users (pending_since) where pending_since is not null;

-- =============================================================
-- 受信メッセージ（顧客 → 公式アカウント）
--   こちらからの返信はチャット画面で行うためAPIでは取れない（記録しない）
-- =============================================================
create table public.sfa_line_messages (
  id bigint generated always as identity primary key,
  line_user_id bigint not null references public.sfa_line_users(id) on delete cascade,
  line_message_id text unique,        -- 再送時の二重登録防止
  webhook_event_id text unique,
  type text not null,                 -- text / image / sticker / file / location ...
  text text,
  sent_at timestamptz not null,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index on public.sfa_line_messages (line_user_id, sent_at desc);

-- =============================================================
-- 招待（営業がSMSで友だち追加URLを送った記録）
--   友だち追加の時刻と突き合わせて、未紐付けの友だちに案件候補を出すのに使う
-- =============================================================
create table public.sfa_line_invites (
  id bigint generated always as identity primary key,
  deal_id bigint not null references public.sfa_deals(id) on delete cascade,
  member_id bigint references public.sfa_members(id),
  phone text,                         -- 送り先（顧客の携帯）
  created_at timestamptz not null default now()
);
create index on public.sfa_line_invites (created_at desc);
create index on public.sfa_line_invites (deal_id);

create trigger sfa_line_users_updated_at before update on public.sfa_line_users
  for each row execute function public.update_updated_at_column();

alter table public.sfa_line_users enable row level security;
alter table public.sfa_line_messages enable row level security;
alter table public.sfa_line_invites enable row level security;

revoke all on public.sfa_line_users, public.sfa_line_messages, public.sfa_line_invites from anon, authenticated;
