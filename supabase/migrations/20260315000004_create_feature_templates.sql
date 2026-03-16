create table feature_templates (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  html_template text not null,
  thumbnail_url varchar(500),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table feature_templates enable row level security;

create policy "Authenticated users can manage feature templates"
  on feature_templates for all
  to authenticated
  using (true)
  with check (true);
