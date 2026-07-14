import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  q: z.string().min(1, '検索語を入力してください'),
  current_price: z.number().positive().optional(),
  limit_n: z.number().int().min(1).max(20).default(8),
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
  const { data, error } = await admin.rpc('youkinavi_search', {
    q: parsed.data.q,
    current_price: parsed.data.current_price ?? null,
    limit_n: parsed.data.limit_n,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
