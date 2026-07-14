-- 見積りAI設定（マージン率・送料等）の参照/更新RPC（管理画面用）
create or replace function public.youkinavi_settings_list()
returns jsonb
language sql stable security definer
set search_path = youkinavi, public
as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.key), '[]'::jsonb)
  from youkinavi.settings s;
$$;

create or replace function public.youkinavi_settings_update(
  p_key text,
  p_value numeric,
  p_operator text
)
returns jsonb
language plpgsql volatile security definer
set search_path = youkinavi, public
as $$
declare
  old_value numeric;
begin
  if p_operator is null or btrim(p_operator) = '' then
    return jsonb_build_object('result', 'blocked', 'reason', '操作者名は必須です');
  end if;
  if p_value is null or p_value < 0 then
    return jsonb_build_object('result', 'blocked', 'reason', '値は0以上を指定してください');
  end if;

  select value into old_value from youkinavi.settings where key = p_key;
  if not found then
    return jsonb_build_object('result', 'blocked', 'reason', format('設定キー「%s」は存在しません', p_key));
  end if;

  update youkinavi.settings set value = p_value, updated_at = now() where key = p_key;

  -- 設定変更も履歴に記録
  insert into youkinavi.price_history (code, name, old_price, new_price, action, operator, source)
  values (p_key, '設定: ' || p_key, old_value, p_value, 'setting_update', p_operator, '管理画面');

  return jsonb_build_object('result', 'updated', 'key', p_key, 'old_value', old_value, 'new_value', p_value);
end;
$$;

revoke execute on function public.youkinavi_settings_list() from anon, public;
revoke execute on function public.youkinavi_settings_update(text, numeric, text) from anon, public;
grant execute on function public.youkinavi_settings_list() to authenticated, service_role;
grant execute on function public.youkinavi_settings_update(text, numeric, text) to authenticated, service_role;
