-- youkinavi_freight: パラメータ名がmaker_freight_rules.maker_name列と衝突していたため改名
drop function if exists public.youkinavi_freight(text, text);

create or replace function public.youkinavi_freight(
  p_maker text default null,
  p_pref text default null
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
  if p_maker is not null then
    select jsonb_agg(to_jsonb(m) - 'created_at' - 'updated_at') into makers_j
      from youkinavi.makers m
     where m.name ilike '%' || p_maker || '%';
    select jsonb_agg(to_jsonb(r)) into rules_j
      from youkinavi.maker_freight_rules r
     where r.maker_name ilike '%' || p_maker || '%';
  end if;
  if p_pref is not null then
    select to_jsonb(p) into pref_j
      from youkinavi.pref_freight p
     where p.pref = p_pref or p.pref = p_pref || '県'
        or p.pref = p_pref || '府' or p.pref = p_pref || '都';
  end if;
  if p_maker is null and p_pref is null then
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

revoke execute on function public.youkinavi_freight(text, text) from anon, public;
grant execute on function public.youkinavi_freight(text, text) to authenticated, service_role;
