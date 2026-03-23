-- 特集ページビルダー用カラム追加
alter table feature_pages add column draft_data jsonb;
alter table feature_pages add column theme_color varchar(7) default '#e8690a';
alter table feature_pages add column template_type varchar(20) check (template_type in ('new_product', 'category', 'simple'));
