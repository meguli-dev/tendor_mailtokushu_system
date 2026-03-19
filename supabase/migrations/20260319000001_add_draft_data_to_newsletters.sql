-- Step 2 の中間状態（AI提案・フォーム値）を保存するためのJSONBカラム
alter table newsletters add column draft_data jsonb;

comment on column newsletters.draft_data is 'Step 2 の中間保存データ（proposal, answers, formFields）';
