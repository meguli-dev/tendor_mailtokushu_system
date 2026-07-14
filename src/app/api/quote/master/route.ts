import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { z } from 'zod'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(request: Request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const url = new URL(request.url)
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('youkinavi_master_list', {
    p_search: url.searchParams.get('search') || null,
    p_maker_id: url.searchParams.get('maker_id') || null,
    p_status: url.searchParams.get('status') || null,
    p_include_inactive: url.searchParams.get('include_inactive') === 'true',
    p_limit: parseInt(url.searchParams.get('limit') || '50', 10),
    p_offset: parseInt(url.searchParams.get('offset') || '0', 10),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

const saveSchema = z.object({
  id: z.number().int().nullable().optional(),
  code: z.string().optional(),
  name: z.string().optional(),
  maker_id: z.string().optional(),
  nyusu: z.number().int().positive().optional(),
  price_new: z.number().positive().optional(),
  sell_price: z.number().positive().nullable().optional(),
  status: z.string().optional(),
  note: z.string().optional(),
  source: z.string().optional(),
  active: z.boolean().optional(),
  force: z.boolean().optional(),
})

export async function POST(request: Request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const parsed = saveSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const d = parsed.data

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('youkinavi_master_save', {
    p_id: d.id ?? null,
    p_operator: user.email || user.id,
    p_code: d.code ?? null,
    p_name: d.name ?? null,
    p_maker_id: d.maker_id ?? null,
    p_nyusu: d.nyusu ?? null,
    p_price_new: d.price_new ?? null,
    p_sell_price: d.sell_price ?? null,
    p_status: d.status ?? null,
    p_note: d.note ?? null,
    p_source: d.source ?? null,
    p_active: d.active ?? null,
    p_force: d.force ?? false,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
