-- 見積もりエンジン RPC群
-- MCP / GPTs / 管理画面はすべてこの関数を経由する（ロジックの二重実装禁止）
-- 計算仕様: 設計書v2.0 §3.3（= v1.0 §5.1-5.2、2026-07-08 MTG確定分）

-- =============================================================
-- 内部: 設定値の取得
-- =============================================================
create or replace function youkinavi.get_setting(p_key text)
returns numeric language sql stable as $$
  select value from youkinavi.settings where key = p_key;
$$;

-- =============================================================
-- 検索 + 勝ち負け診断
--   q: 型番・商品名（表記ゆれ可）
--   current_price: 顧客の現在価格（円/枚、任意）
-- 3段フォールバック: 完全一致 → 前方一致 → トリグラム類似
-- =============================================================
create or replace function public.youkinavi_search(
  q text,
  current_price numeric default null,
  limit_n int default 8
)
returns jsonb
language plpgsql stable security definer
set search_path = youkinavi, public, extensions
as $$
declare
  k text := youkinavi.norm_key(q);
  margin numeric := coalesce(youkinavi.get_setting('margin_rate'), 0.25);
  result jsonb;
begin
  if k = '' then
    return jsonb_build_object('error', '検索語が空です');
  end if;

  with matched as (
    (select cm.*, 1.0::real as score, 'exact' as match_type
       from youkinavi.cost_master cm
      where cm.active and cm.name_key = k)
    union all
    (select cm.*, 0.9::real, 'prefix'
       from youkinavi.cost_master cm
      where cm.active and cm.name_key like k || '%' and cm.name_key <> k
      limit 20)
    union all
    (select cm.*, similarity(cm.name_key, k), 'fuzzy'
       from youkinavi.cost_master cm
      where cm.active and cm.name_key % k
      order by similarity(cm.name_key, k) desc
      limit 20)
  ),
  ranked as (
    select distinct on (m.id) m.*
    from matched m
    order by m.id, m.score desc
  ),
  enriched as (
    select r.*,
      round(r.price_new * (1 + margin), 2) as floor_price,
      bp.case_price as ec_case_price,
      bp.unit_price as ec_unit_price,
      bp.name as ec_product_name
    from ranked r
    left join lateral (
      select * from youkinavi.bcart_products b
      where b.name_key = r.name_key
      order by b.unit = 'ケース' desc nulls last
      limit 1
    ) bp on true
  )
  select jsonb_agg(jsonb_build_object(
    'code', e.code,
    'name', e.name,
    'maker', e.maker_name,
    'nyusu', e.nyusu,
    'status', e.status,
    'match_type', e.match_type,
    'score', round(e.score::numeric, 3),
    'cost_price', e.price_new,                       -- ★社外秘: 顧客提示禁止
    'floor_price', e.floor_price,                    -- ★社外秘: 下限売価（原価×1.25）
    'ec_unit_price', e.ec_unit_price,                -- 容器なび通常単価
    'ec_case_price', e.ec_case_price,
    'ec_product_name', e.ec_product_name,
    'freight_fee', coalesce(e.freight_fee_row, mk.freight_fee),
    'motobarai', coalesce(e.motobarai_row, mk.motobarai),
    'verdict', case
      when current_price is null then null
      when e.ec_unit_price is not null and e.ec_unit_price <= current_price then '勝ち'
      when e.floor_price <= current_price then '戦える'
      else '負け'
    end,
    'tokune_range', case
      when current_price is not null and e.floor_price <= current_price
           and (e.ec_unit_price is null or e.ec_unit_price > current_price)
      then jsonb_build_object('min', e.floor_price, 'max', current_price)
      else null
    end
  ) order by e.score desc)
  into result
  from (select * from enriched order by score desc limit limit_n) e
  left join youkinavi.makers mk on mk.id = e.maker_id;

  return jsonb_build_object(
    'query', q,
    'normalized_key', k,
    'current_price', current_price,
    'confidential_note', 'cost_price と floor_price は社外秘。顧客への提示・送信は禁止。',
    'candidates', coalesce(result, '[]'::jsonb)
  );
end;
$$;

-- =============================================================
-- 見積もり計算
--   q: 型番・商品名 / qty: ケース数 / mode: 'own'(自社配送) | 'direct'(直送)
--   pref: 届け先都道府県（任意、北海道・沖縄ガード用）
-- 確定ロジック:
--   基準売価 = 仕入原価 × (1+マージン率0.25)
--   自社配送: 提示単価 = 基準売価 + 標準送料800 ÷ ROUND(送料無料ライン5000 ÷ 基準売価)
--   直送(元払い条件以上): 提示単価 = 基準売価
--   直送(元払い未満): 頭割り分母が未確定のため要個別確認を返す
-- =============================================================
create or replace function public.youkinavi_quote(
  q text,
  qty int,
  mode text default 'own',
  pref text default null
)
returns jsonb
language plpgsql stable security definer
set search_path = youkinavi, public, extensions
as $$
declare
  k text := youkinavi.norm_key(q);
  margin numeric := coalesce(youkinavi.get_setting('margin_rate'), 0.25);
  std_ship numeric := coalesce(youkinavi.get_setting('standard_shipping'), 800);
  free_line numeric := coalesce(youkinavi.get_setting('free_shipping_line'), 5000);
  item record;
  mk record;
  base numeric;
  denom numeric;
  unit_price numeric;
  steps jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
begin
  if qty is null or qty <= 0 then
    return jsonb_build_object('error', '数量（ケース数）は1以上を指定してください');
  end if;
  if mode not in ('own', 'direct') then
    return jsonb_build_object('error', 'modeは own（自社配送）または direct（直送）を指定してください');
  end if;

  -- 商品特定: 完全一致 → トリグラム最上位
  select * into item from youkinavi.cost_master
   where active and name_key = k limit 1;
  if not found then
    select * into item from youkinavi.cost_master
     where active and name_key % k
     order by similarity(name_key, k) desc limit 1;
    if not found then
      return jsonb_build_object('error', format('「%s」に一致する商品が見つかりません。youkinavi_searchで候補を確認してください。', q));
    end if;
    warnings := warnings || jsonb_build_array(format('完全一致なし。最も近い「%s」で計算しています。', item.name));
  end if;
  if item.price_new is null then
    return jsonb_build_object('error', format('「%s」は原価未設定（状態: %s）のため計算できません', item.name, coalesce(item.status, '不明')));
  end if;
  if item.status in ('廃番') then
    warnings := warnings || jsonb_build_array(format('この商品は「%s」です。対応品の提案を検討してください。', item.status));
  end if;

  select * into mk from youkinavi.makers where id = item.maker_id;

  base := round(item.price_new * (1 + margin), 2);
  steps := steps || jsonb_build_array(format('基準売価 = 仕入原価 %s円 × %s = %s円/枚', item.price_new, 1 + margin, base));

  if mode = 'own' then
    denom := greatest(round(free_line / base), 1);
    unit_price := round(base + std_ship / denom, 2);
    steps := steps || jsonb_build_array(
      format('頭割り分母 = ROUND(%s円 ÷ %s円) = %s', free_line, base, denom),
      format('提示単価 = %s円 + %s円 ÷ %s = %s円/枚', base, std_ship, denom, unit_price)
    );
  else
    if mk.motobarai_cases is not null and qty >= mk.motobarai_cases then
      unit_price := base;
      steps := steps || jsonb_build_array(
        format('直送: %sケース ≧ 元払い条件%sケース → 送料なし、提示単価 = 基準売価 %s円/枚', qty, mk.motobarai_cases, base)
      );
    else
      unit_price := null;
      warnings := warnings || jsonb_build_array(
        case
          when mk.motobarai_cases is null
          then format('メーカー「%s」の元払い条件（%s）が数値化できないため、直送は要個別確認です。', coalesce(mk.name, item.maker_name), coalesce(mk.motobarai, '不明'))
          else format('%sケースは元払い条件（%sケース以上）未満です。直送の送料頭割り分母が未確定（テンドール確認中）のため要個別確認です。', qty, mk.motobarai_cases)
        end
      );
    end if;
  end if;

  if pref in ('北海道', '沖縄県') then
    warnings := warnings || jsonb_build_array(format('%sは全国一律送料の自動計算対象外です。個別に送料を確認してください。', pref));
  end if;

  return jsonb_build_object(
    'product', jsonb_build_object(
      'code', item.code, 'name', item.name, 'maker', item.maker_name,
      'nyusu', item.nyusu, 'status', item.status
    ),
    'mode', mode,
    'qty_cases', qty,
    'unit_price', unit_price,                        -- 円/枚（税抜・送料込）
    'case_price', case when unit_price is not null and item.nyusu is not null
                       then round(unit_price * item.nyusu, 0) else null end,
    'total', case when unit_price is not null and item.nyusu is not null
                  then round(unit_price * item.nyusu * qty, 0) else null end,
    'cost_price', item.price_new,                    -- ★社外秘
    'floor_price', base,                             -- ★社外秘
    'calc_steps', steps,
    'warnings', warnings,
    'notes', jsonb_build_array(
      '単価はすべて税抜。決済後の送料追加は行わない（送料込み単価で確定）。',
      '見積書の価格表示は1段階のみ。備考に「◯ケース以上は価格調整いたします」と記載。'
    ),
    'confidential_note', 'cost_price と floor_price は社外秘。顧客への提示・送信は禁止。'
  );
end;
$$;

-- =============================================================
-- 送料検索: メーカー運賃・元払い条件 / 都道府県タリフ
-- =============================================================
create or replace function public.youkinavi_freight(
  maker_name text default null,
  pref_name text default null
)
returns jsonb
language plpgsql stable security definer
set search_path = youkinavi, public, extensions
as $$
declare
  makers_j jsonb;
  rules_j jsonb;
  pref_j jsonb;
begin
  if maker_name is not null then
    select jsonb_agg(to_jsonb(m) - 'created_at' - 'updated_at') into makers_j
      from youkinavi.makers m
     where m.name ilike '%' || maker_name || '%';
    select jsonb_agg(to_jsonb(r)) into rules_j
      from youkinavi.maker_freight_rules r
     where r.maker_name ilike '%' || maker_name || '%';
  end if;
  if pref_name is not null then
    select to_jsonb(p) into pref_j
      from youkinavi.pref_freight p
     where p.pref = pref_name or p.pref = pref_name || '県'
        or p.pref = pref_name || '府' or p.pref = pref_name || '都';
  end if;
  if maker_name is null and pref_name is null then
    select jsonb_agg(to_jsonb(m) - 'created_at' - 'updated_at' order by m.id) into makers_j
      from youkinavi.makers m;
  end if;
  return jsonb_build_object(
    'makers', coalesce(makers_j, '[]'::jsonb),
    'special_rules', coalesce(rules_j, '[]'::jsonb),
    'pref_tariff', pref_j
  );
end;
$$;

-- =============================================================
-- 原価の登録・更新（ガードレール付き）
--   単価0以下は拒否 / ±50%超の変動はforceなしでは拒否 / 物理削除不可
--   全書き込みを price_history に記録（操作者名必須）
-- =============================================================
create or replace function public.youkinavi_cost_upsert(
  p_code text,
  p_name text,
  p_price numeric,
  p_operator text,
  p_maker_id text default null,
  p_nyusu int default null,
  p_status text default null,
  p_source text default null,
  p_force boolean default false
)
returns jsonb
language plpgsql volatile security definer
set search_path = youkinavi, public, extensions
as $$
declare
  existing record;
  exists_row boolean := false;
  change_rate numeric;
  new_id bigint;
begin
  if p_operator is null or btrim(p_operator) = '' then
    return jsonb_build_object('result', 'blocked', 'reason', '操作者名（operator）は必須です');
  end if;
  if p_price is null or p_price <= 0 then
    return jsonb_build_object('result', 'blocked', 'reason', '単価は0より大きい値を指定してください');
  end if;

  select * into existing from youkinavi.cost_master
   where (p_code is not null and code = p_code)
      or (p_code is null and name_key = youkinavi.norm_key(p_name))
   limit 1;
  exists_row := found;

  if exists_row then
    if existing.price_new is not null and existing.price_new > 0 then
      change_rate := abs(p_price - existing.price_new) / existing.price_new;
      if change_rate > 0.5 and not p_force then
        return jsonb_build_object(
          'result', 'blocked',
          'reason', format('価格変動が±50%%を超えています（%s円 → %s円、%s%%）。打ち間違いでないことを確認し、force=true で再実行してください。',
            existing.price_new, p_price, round(change_rate * 100, 1))
        );
      end if;
    end if;
    update youkinavi.cost_master
       set price_old = existing.price_new,
           price_new = p_price,
           status = coalesce(p_status, status),
           nyusu = coalesce(p_nyusu, nyusu),
           source = coalesce(p_source, source)
     where id = existing.id;
    insert into youkinavi.price_history (cost_master_id, code, name, old_price, new_price, action, operator, source)
    values (existing.id, existing.code, existing.name, existing.price_new, p_price, 'update', p_operator, p_source);
    return jsonb_build_object('result', 'updated', 'id', existing.id, 'name', existing.name,
      'old_price', existing.price_new, 'new_price', p_price);
  else
    insert into youkinavi.cost_master (maker_id, code, name, nyusu, price_new, status, source)
    values (p_maker_id, p_code, p_name, p_nyusu, p_price, coalesce(p_status, '新規登録'), p_source)
    returning id into new_id;
    insert into youkinavi.price_history (cost_master_id, code, name, old_price, new_price, action, operator, source)
    values (new_id, p_code, p_name, null, p_price, 'create', p_operator, p_source);
    return jsonb_build_object('result', 'created', 'id', new_id, 'name', p_name, 'new_price', p_price);
  end if;
end;
$$;

-- =============================================================
-- 更新履歴の参照
-- =============================================================
create or replace function public.youkinavi_history(
  p_from date default null,
  p_to date default null,
  p_code text default null,
  limit_n int default 50
)
returns jsonb
language sql stable security definer
set search_path = youkinavi, public
as $$
  select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc), '[]'::jsonb)
  from (
    select * from youkinavi.price_history
    where (p_from is null or created_at >= p_from)
      and (p_to is null or created_at < p_to + 1)
      and (p_code is null or code = p_code)
    order by created_at desc
    limit limit_n
  ) h;
$$;

-- =============================================================
-- Bcart商品の一括upsert（同期スクリプト用）
-- =============================================================
create or replace function public.youkinavi_bcart_upsert(items jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = youkinavi, public
as $$
declare
  n int;
begin
  insert into youkinavi.bcart_products (id, set_id, name, set_name, code, color, unit, unit_price, nyusu, case_price, category, kubun, display, raw, synced_at)
  select
    (i->>'id')::bigint, (i->>'set_id')::bigint, i->>'name', i->>'set_name', i->>'code', i->>'color', i->>'unit',
    (i->>'unit_price')::numeric, (i->>'nyusu')::int, (i->>'case_price')::numeric, i->>'category', i->>'kubun',
    (i->>'display')::boolean, i->'raw', now()
  from jsonb_array_elements(items) as i
  on conflict (id) do update set
    set_id = excluded.set_id, name = excluded.name, set_name = excluded.set_name, code = excluded.code,
    color = excluded.color, unit = excluded.unit, unit_price = excluded.unit_price, nyusu = excluded.nyusu,
    case_price = excluded.case_price, category = excluded.category, kubun = excluded.kubun,
    display = excluded.display, raw = excluded.raw, synced_at = now();
  get diagnostics n = row_count;
  return jsonb_build_object('upserted', n);
end;
$$;

-- =============================================================
-- 権限: anonからのRPC実行を拒否（ログインユーザーとservice roleのみ）
-- =============================================================
revoke execute on function public.youkinavi_search(text, numeric, int) from anon, public;
revoke execute on function public.youkinavi_quote(text, int, text, text) from anon, public;
revoke execute on function public.youkinavi_freight(text, text) from anon, public;
revoke execute on function public.youkinavi_cost_upsert(text, text, numeric, text, text, int, text, text, boolean) from anon, public;
revoke execute on function public.youkinavi_history(date, date, text, int) from anon, public;
revoke execute on function public.youkinavi_bcart_upsert(jsonb) from anon, public;
grant execute on function public.youkinavi_search(text, numeric, int) to authenticated, service_role;
grant execute on function public.youkinavi_quote(text, int, text, text) to authenticated, service_role;
grant execute on function public.youkinavi_freight(text, text) to authenticated, service_role;
grant execute on function public.youkinavi_cost_upsert(text, text, numeric, text, text, int, text, text, boolean) to authenticated, service_role;
grant execute on function public.youkinavi_history(date, date, text, int) to authenticated, service_role;
grant execute on function public.youkinavi_bcart_upsert(jsonb) to service_role;
