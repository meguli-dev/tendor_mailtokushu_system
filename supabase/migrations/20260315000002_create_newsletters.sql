create table newsletters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title varchar(255) not null,
  template_id uuid references newsletter_templates(id) on delete set null,
  has_header_image boolean default false,
  header_image_url varchar(500),
  feature_title varchar(255),
  feature_description text,
  html_output text,
  status varchar(20) default 'draft' check (status in ('draft', 'exported', 'sent')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table newsletters enable row level security;

create policy "Authenticated users can manage newsletters"
  on newsletters for all
  to authenticated
  using (true)
  with check (true);
