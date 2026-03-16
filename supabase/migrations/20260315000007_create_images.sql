create table images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  s3_key varchar(500) not null,
  s3_url varchar(500) not null,
  original_url varchar(500),
  image_type varchar(20) default 'other' check (image_type in ('product', 'banner', 'header', 'other')),
  file_name varchar(255) not null,
  file_size integer,
  width integer,
  height integer,
  created_at timestamptz default now()
);

alter table images enable row level security;

create policy "Authenticated users can manage images"
  on images for all
  to authenticated
  using (true)
  with check (true);
