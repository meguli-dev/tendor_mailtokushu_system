-- 画像生成の月次カウント用: 編集（is_edit=true）は無料枠カウント対象外
alter table banner_generation_logs add column is_edit boolean not null default false;

-- 月次カウントを高速に取得するためのインデックス
create index idx_banner_logs_monthly_count
  on banner_generation_logs (user_id, created_at)
  where is_edit = false;
