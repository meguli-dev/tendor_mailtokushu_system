create table feature_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title varchar(255) not null,
  template_id uuid references feature_templates(id) on delete set null,
  header_image_url varchar(500),
  html_output text,
  status varchar(20) default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table feature_pages enable row level security;

create policy "Authenticated users can manage feature pages"
  on feature_pages for all
  to authenticated
  using (true)
  with check (true);
