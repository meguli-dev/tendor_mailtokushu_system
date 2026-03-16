create table newsletter_templates (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  description varchar(255) default '',
  product_count integer not null default 2,
  has_ranking boolean default false,
  html_template text not null,
  thumbnail_url varchar(500),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table newsletter_templates enable row level security;

create policy "Authenticated users can view templates"
  on newsletter_templates for select
  to authenticated
  using (true);

create policy "Authenticated users can manage templates"
  on newsletter_templates for all
  to authenticated
  using (true)
  with check (true);
