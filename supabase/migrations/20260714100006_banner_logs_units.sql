-- 画像生成の使用量を枚数単位でカウントするためのunits列（高品質モデル=2枚分）
alter table banner_generation_logs add column if not exists units int not null default 1;

-- method のcheck制約に openai を追加
alter table banner_generation_logs drop constraint if exists banner_generation_logs_method_check;
alter table banner_generation_logs add constraint banner_generation_logs_method_check
  check (method in ('gemini', 'openai', 'genspark_prompt', 'manus', 'manual'));
