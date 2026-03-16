create table feature_products (
  id uuid primary key default gen_random_uuid(),
  feature_page_id uuid not null references feature_pages(id) on delete cascade,
  sort_order integer not null default 0,
  product_url varchar(500) not null,
  product_name varchar(255),
  s3_image_url varchar(500),
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table feature_products enable row level security;

create policy "Authenticated users can manage feature products"
  on feature_products for all
  to authenticated
  using (true)
  with check (true);
