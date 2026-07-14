import { gptAuthorized, unauthorized, callRpc } from '@/lib/gpt-api'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  q: z.string().min(1),
  current_price: z.number().positive().optional(),
  limit_n: z.number().int().min(1).max(20).optional(),
})

export async function POST(request: Request) {
  if (!gptAuthorized(request)) return unauthorized()
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  return callRpc('youkinavi_search', {
    q: parsed.data.q,
    current_price: parsed.data.current_price ?? null,
    limit_n: parsed.data.limit_n ?? 8,
  })
}
