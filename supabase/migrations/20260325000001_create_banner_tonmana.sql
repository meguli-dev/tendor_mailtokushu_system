-- バナートンマナ（トーン&マナー）設定テーブル
-- ユーザーごとに1レコード（upsert で管理）
create table banner_tonmana (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  design_style varchar(30) not null default 'clean',
  color_primary varchar(7) not null default '#e8690a',
  color_accent varchar(7) not null default '#2563eb',
  color_background varchar(20) not null default 'warm',
  font_style varchar(30) not null default 'bold_readable',
  atmosphere text not null default '',
  ng_elements text not null default '',
  reference_image_url varchar(500),
  additional_instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- RLS
alter table banner_tonmana enable row level security;

create policy "Users can manage own tonmana"
  on banner_tonmana for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at trigger
create trigger set_updated_at
  before update on banner_tonmana
  for each row
  execute function update_updated_at_column();
