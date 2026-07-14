-- 原価マスタCRUD用RPC（管理画面用）
-- チャットAI（MCP/GPTs）が主入口だが、データを綺麗に保つための整備画面から使う

-- 一覧・検索（ページング付き）
create or replace function public.youkinavi_master_list(
  p_search text default null,
  p_maker_id text default null,
  p_status text default null,
  p_include_inactive boolean default false,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql stable security definer
set search_path = youkinavi, public, extensions
as $$
declare
  k text := case when p_search is not null and btrim(p_search) <> '' then youkinavi.norm_key(p_search) else null end;
  total_count bigint;
  rows_j jsonb;
begin
  select count(*) into total_count
  from youkinavi.cost_master c
  where (p_include_inactive or c.active)
    and (k is null or c.name_key like '%' || k || '%' or c.code ilike '%' || btrim(p_search) || '%')
    and (p_maker_id is null or c.maker_id = p_maker_id)
    and (p_status is null or c.status = p_status);

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into rows_j
  from (
    select c.id, c.maker_id, c.maker_name, c.code, c.name, c.material, c.nyusu,
           c.price_old, c.price_new, c.sell_price, c.status, c.jisseki,
           c.freight_fee_row, c.motobarai_row, c.note, c.source, c.active, c.updated_at
    from youkinavi.cost_master c
    where (p_include_inactive or c.active)
      and (k is null or c.name_key like '%' || k || '%' or c.code ilike '%' || btrim(p_search) || '%')
      and (p_maker_id is null or c.maker_id = p_maker_id)
      and (p_status is null or c.status = p_status)
    order by c.maker_id, c.code
    limit least(p_limit, 200) offset greatest(p_offset, 0)
  ) r;

  return jsonb_build_object('total', total_count, 'rows', rows_j);
end;
$$;

-- 全項目更新/新規登録（管理画面用。ガードレールはcost_upsertと同等）
create or replace function public.youkinavi_master_save(
  p_id bigint,                        -- nullなら新規登録
  p_operator text,
  p_code text default null,
  p_name text default null,
  p_maker_id text default null,
  p_nyusu int default null,
  p_price_new numeric default null,
  p_sell_price numeric default null,
  p_status text default null,
  p_note text default null,
  p_source text default null,
  p_active boolean default null,
  p_force boolean default false
)
returns jsonb
language plpgsql volatile security definer
set search_path = youkinavi, public, extensions
as $$
declare
  existing record;
  change_rate numeric;
  new_id bigint;
  mk_name text;
begin
  if p_operator is null or btrim(p_operator) = '' then
    return jsonb_build_object('result', 'blocked', 'reason', '操作者名は必須です');
  end if;

  if p_id is not null then
    select * into existing from youkinavi.cost_master where id = p_id;
    if not found then
      return jsonb_build_object('result', 'blocked', 'reason', format('ID %s の商品が見つかりません', p_id));
    end if;

    if p_price_new is not null then
      if p_price_new <= 0 then
        return jsonb_build_object('result', 'blocked', 'reason', '単価は0より大きい値を指定してください');
      end if;
      if existing.price_new is not null and existing.price_new > 0 then
        change_rate := abs(p_price_new - existing.price_new) / existing.price_new;
        if change_rate > 0.5 and not p_force then
          return jsonb_build_object('result', 'blocked',
            'reason', format('価格変動が±50%%を超えています（%s円 → %s円）。確認の上、強制適用で再実行してください。', existing.price_new, p_price_new));
        end if;
      end if;
    end if;

    update youkinavi.cost_master set
      code = coalesce(p_code, code),
      name = coalesce(p_name, name),
      maker_id = coalesce(p_maker_id, maker_id),
      maker_name = coalesce((select name from youkinavi.makers where id = coalesce(p_maker_id, maker_id)), maker_name),
      nyusu = coalesce(p_nyusu, nyusu),
      price_old = case when p_price_new is not null and p_price_new <> price_new then price_new else price_old end,
      price_new = coalesce(p_price_new, price_new),
      sell_price = coalesce(p_sell_price, sell_price),
      status = coalesce(p_status, status),
      note = coalesce(p_note, note),
      source = coalesce(p_source, source),
      active = coalesce(p_active, active)
    where id = p_id;

    if p_price_new is not null and p_price_new is distinct from existing.price_new then
      insert into youkinavi.price_history (cost_master_id, code, name, old_price, new_price, action, operator, source)
      values (p_id, existing.code, existing.name, existing.price_new, p_price_new, 'update', p_operator, coalesce(p_source, '管理画面'));
    end if;
    if p_active is not null and p_active is distinct from existing.active then
      insert into youkinavi.price_history (cost_master_id, code, name, old_price, new_price, action, operator, source)
      values (p_id, existing.code, existing.name, existing.price_new, existing.price_new,
              case when p_active then 'reactivate' else 'discontinue' end, p_operator, '管理画面');
    end if;

    return jsonb_build_object('result', 'updated', 'id', p_id);
  else
    -- 新規登録
    if p_name is null or btrim(p_name) = '' then
      return jsonb_build_object('result', 'blocked', 'reason', '商品名は必須です');
    end if;
    if p_price_new is null or p_price_new <= 0 then
      return jsonb_build_object('result', 'blocked', 'reason', '単価は0より大きい値を指定してください');
    end if;
    select name into mk_name from youkinavi.makers where id = p_maker_id;

    insert into youkinavi.cost_master (maker_id, maker_name, code, name, nyusu, price_new, sell_price, status, note, source)
    values (p_maker_id, mk_name, p_code, p_name, p_nyusu, p_price_new, p_sell_price, coalesce(p_status, '新規登録'), p_note, coalesce(p_source, '管理画面'))
    returning id into new_id;

    insert into youkinavi.price_history (cost_master_id, code, name, old_price, new_price, action, operator, source)
    values (new_id, p_code, p_name, null, p_price_new, 'create', p_operator, coalesce(p_source, '管理画面'));

    return jsonb_build_object('result', 'created', 'id', new_id);
  end if;
end;
$$;

-- メーカー一覧（プルダウン用の軽量版）
create or replace function public.youkinavi_makers_list()
returns jsonb
language sql stable security definer
set search_path = youkinavi, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by m.id), '[]'::jsonb)
  from youkinavi.makers m;
$$;

revoke execute on function public.youkinavi_master_list(text, text, text, boolean, int, int) from anon, public;
revoke execute on function public.youkinavi_master_save(bigint, text, text, text, text, int, numeric, numeric, text, text, text, boolean, boolean) from anon, public;
revoke execute on function public.youkinavi_makers_list() from anon, public;
grant execute on function public.youkinavi_master_list(text, text, text, boolean, int, int) to authenticated, service_role;
grant execute on function public.youkinavi_master_save(bigint, text, text, text, text, int, numeric, numeric, text, text, text, boolean, boolean) to authenticated, service_role;
grant execute on function public.youkinavi_makers_list() to authenticated, service_role;
