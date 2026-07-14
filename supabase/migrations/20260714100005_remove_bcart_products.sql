-- Bcart商品データを見積もりエンジンから切り離す
-- 理由: テンドールのBcart運用は企業ごとに商品を作成し特別価格を紐づける方式であり、
--       EC表示価格は一般向けの高め設定のため、見積もりの判定基準に使うと誤る。
--       見積もりは仕入原価マスタのみを正とし、商品データはECと独立に育てる。

drop function if exists public.youkinavi_bcart_upsert(jsonb);
drop table if exists youkinavi.bcart_products;

-- 容器なび通常売価（勝ち判定用）。ECからは取らず、運用の中で手動/AI取込で育てる
alter table youkinavi.cost_master add column if not exists sell_price numeric;

-- search を再定義: EC結合を廃止し、勝ち判定は cost_master.sell_price（あれば）を使う
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
    select r.*, round(r.price_new * (1 + margin), 2) as floor_price
    from ranked r
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
    'sell_price', e.sell_price,                      -- 容器なび通常売価（未設定はnull）
    'freight_fee', coalesce(e.freight_fee_row, mk.freight_fee),
    'motobarai', coalesce(e.motobarai_row, mk.motobarai),
    'verdict', case
      when current_price is null then null
      when e.sell_price is not null and e.sell_price <= current_price then '勝ち'
      when e.floor_price <= current_price then '戦える'
      else '負け'
    end,
    'tokune_range', case
      when current_price is not null and e.floor_price <= current_price
           and (e.sell_price is null or e.sell_price > current_price)
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

revoke execute on function public.youkinavi_search(text, numeric, int) from anon, public;
grant execute on function public.youkinavi_search(text, numeric, int) to authenticated, service_role;
