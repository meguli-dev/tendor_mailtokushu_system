import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  items: z.array(z.string().min(1)).min(1, '品目を入力してください').max(5),
  qty: z.number().int().min(1),
  mode: z.enum(['own', 'direct', 'bara']).default('own'),
  pref: z.string().optional(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('youkinavi_quote_set', {
    items: parsed.data.items,
    qty: parsed.data.qty,
    mode: parsed.data.mode,
    pref: parsed.data.pref ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
