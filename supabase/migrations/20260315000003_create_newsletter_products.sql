create table newsletter_products (
  id uuid primary key default gen_random_uuid(),
  newsletter_id uuid not null references newsletters(id) on delete cascade,
  sort_order integer not null default 0,
  product_url varchar(500) not null,
  product_name varchar(255),
  product_image_url varchar(500),
  s3_image_url varchar(500),
  is_ranking boolean default false,
  rank_position integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table newsletter_products enable row level security;

create policy "Authenticated users can manage newsletter products"
  on newsletter_products for all
  to authenticated
  using (true)
  with check (true);
