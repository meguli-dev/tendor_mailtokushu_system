-- セット見積もり: 複数品目（本体+蓋など）を合算して1セット単価として計算する
-- 単品はitemsが1要素の配列として同じ関数で計算できる
create or replace function public.youkinavi_quote_set(
  items text[],
  qty int,
  mode text default 'own',
  pref text default null
)
returns jsonb
language plpgsql stable security definer
set search_path = youkinavi, public, extensions
as $$
declare
  margin numeric := coalesce(youkinavi.get_setting('margin_rate'), 0.25);
  std_ship numeric := coalesce(youkinavi.get_setting('standard_shipping'), 800);
  free_line numeric := coalesce(youkinavi.get_setting('free_shipping_line'), 5000);
  q text;
  k text;
  item record;
  mk record;
  first_maker_id text := null;
  makers_differ boolean := false;
  nyusu_set int := null;
  nyusu_differ boolean := false;
  cost_sum numeric := 0;
  base numeric;
  denom numeric;
  unit_price numeric;
  item_details jsonb := '[]'::jsonb;
  steps jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
begin
  if items is null or array_length(items, 1) is null or array_length(items, 1) = 0 then
    return jsonb_build_object('error', 'itemsに1品目以上を指定してください');
  end if;
  if array_length(items, 1) > 5 then
    return jsonb_build_object('error', 'セットは最大5品目までです');
  end if;
  if qty is null or qty <= 0 then
    return jsonb_build_object('error', '数量（ケース数）は1以上を指定してください');
  end if;
  if mode not in ('own', 'direct') then
    return jsonb_build_object('error', 'modeは own（自社配送）または direct（直送）を指定してください');
  end if;

  foreach q in array items loop
    k := youkinavi.norm_key(q);
    select * into item from youkinavi.cost_master
     where active and name_key = k limit 1;
    if not found then
      select * into item from youkinavi.cost_master
       where active and name_key % k
       order by similarity(name_key, k) desc limit 1;
      if not found then
        return jsonb_build_object('error', format('「%s」に一致する商品が見つかりません。youkinavi_searchで候補を確認してください。', q));
      end if;
      warnings := warnings || jsonb_build_array(format('「%s」は完全一致なし。最も近い「%s」で計算しています。', q, item.name));
    end if;
    if item.price_new is null then
      return jsonb_build_object('error', format('「%s」は原価未設定（状態: %s）のため計算できません', item.name, coalesce(item.status, '不明')));
    end if;
    if item.status in ('廃番') then
      warnings := warnings || jsonb_build_array(format('「%s」は廃番です。対応品の提案を検討してください。', item.name));
    end if;

    if first_maker_id is null then
      first_maker_id := item.maker_id;
    elsif item.maker_id is distinct from first_maker_id then
      makers_differ := true;
    end if;
    if nyusu_set is null then
      nyusu_set := item.nyusu;
    elsif item.nyusu is distinct from nyusu_set then
      nyusu_differ := true;
    end if;

    cost_sum := cost_sum + item.price_new;
    item_details := item_details || jsonb_build_array(jsonb_build_object(
      'code', item.code, 'name', item.name, 'maker', item.maker_name,
      'nyusu', item.nyusu,
      'cost_price', item.price_new,
      'floor_price', round(item.price_new * (1 + margin), 2),
      'status', item.status
    ));
  end loop;

  if makers_differ then
    warnings := warnings || jsonb_build_array('セット内でメーカーが異なります。直送条件は先頭品目のメーカーで判定しています。');
  end if;
  if nyusu_differ then
    warnings := warnings || jsonb_build_array('セット内で入数が異なります。ケース金額・合計は先頭品目の入数で計算しています。実際の梱包単位を確認してください。');
  end if;

  select * into mk from youkinavi.makers where id = first_maker_id;

  base := round(cost_sum * (1 + margin), 2);
  steps := steps || jsonb_build_array(
    format('セット原価 = %s円/セット（%s品目合算）', cost_sum, array_length(items, 1)),
    format('基準売価 = %s円 × %s = %s円/セット', cost_sum, 1 + margin, base)
  );

  if mode = 'own' then
    denom := greatest(round(free_line / base), 1);
    unit_price := round(base + std_ship / denom, 2);
    steps := steps || jsonb_build_array(
      format('頭割り分母 = ROUND(%s円 ÷ %s円) = %s', free_line, base, denom),
      format('提示単価 = %s円 + %s円 ÷ %s = %s円/セット', base, std_ship, denom, unit_price)
    );
  else
    if mk.motobarai_cases is not null and qty >= mk.motobarai_cases then
      unit_price := base;
      steps := steps || jsonb_build_array(
        format('直送: %sケース ≧ 元払い条件%sケース → 送料なし、提示単価 = 基準売価 %s円/セット', qty, mk.motobarai_cases, base)
      );
    else
      unit_price := null;
      warnings := warnings || jsonb_build_array(
        case
          when mk.motobarai_cases is null
          then format('メーカー「%s」の元払い条件（%s）が数値化できないため、直送は要個別確認です。', coalesce(mk.name, '不明'), coalesce(mk.motobarai, '不明'))
          else format('%sケースは元払い条件（%sケース以上）未満です。直送の送料頭割り分母が未確定（テンドール確認中）のため要個別確認です。', qty, mk.motobarai_cases)
        end
      );
    end if;
  end if;

  if pref in ('北海道', '沖縄県') then
    warnings := warnings || jsonb_build_array(format('%sは全国一律送料の自動計算対象外です。個別に送料を確認してください。', pref));
  end if;

  return jsonb_build_object(
    'items', item_details,
    'item_count', array_length(items, 1),
    'mode', mode,
    'qty_cases', qty,
    'unit_price', unit_price,                       -- 円/セット（税抜・送料込）
    'case_price', case when unit_price is not null and nyusu_set is not null
                       then round(unit_price * nyusu_set, 0) else null end,
    'total', case when unit_price is not null and nyusu_set is not null
                  then round(unit_price * nyusu_set * qty, 0) else null end,
    'cost_price_set', cost_sum,                     -- ★社外秘
    'floor_price_set', base,                        -- ★社外秘
    'calc_steps', steps,
    'warnings', warnings,
    'notes', jsonb_build_array(
      '単価はすべて税抜。決済後の送料追加は行わない（送料込み単価で確定）。',
      '見積書の価格表示は1段階のみ。備考に「◯ケース以上は価格調整いたします」と記載。'
    ),
    'confidential_note', 'cost_price_set と floor_price_set、items内のcost_price/floor_priceは社外秘。顧客への提示・送信は禁止。'
  );
end;
$$;

revoke execute on function public.youkinavi_quote_set(text[], int, text, text) from anon, public;
grant execute on function public.youkinavi_quote_set(text[], int, text, text) to authenticated, service_role;
