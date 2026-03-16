create table banner_generation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  newsletter_id uuid references newsletters(id) on delete set null,
  feature_page_id uuid references feature_pages(id) on delete set null,
  method varchar(20) not null check (method in ('gemini', 'genspark_prompt', 'manus', 'manual')),
  prompt text,
  input_params jsonb,
  result_image_url varchar(500),
  status varchar(20) default 'pending' check (status in ('pending', 'generated', 'approved', 'rejected')),
  created_at timestamptz default now()
);

alter table banner_generation_logs enable row level security;

create policy "Authenticated users can manage banner logs"
  on banner_generation_logs for all
  to authenticated
  using (true)
  with check (true);
