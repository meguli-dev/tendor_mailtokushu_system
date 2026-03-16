-- Function to automatically update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply trigger to all tables with updated_at
create trigger update_newsletter_templates_updated_at
  before update on newsletter_templates
  for each row execute function update_updated_at_column();

create trigger update_newsletters_updated_at
  before update on newsletters
  for each row execute function update_updated_at_column();

create trigger update_newsletter_products_updated_at
  before update on newsletter_products
  for each row execute function update_updated_at_column();

create trigger update_feature_pages_updated_at
  before update on feature_pages
  for each row execute function update_updated_at_column();

create trigger update_feature_products_updated_at
  before update on feature_products
  for each row execute function update_updated_at_column();
