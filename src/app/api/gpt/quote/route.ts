import { gptAuthorized, unauthorized, callRpc } from '@/lib/gpt-api'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  items: z.array(z.string().min(1)).min(1).max(5),
  qty: z.number().int().min(1),
  mode: z.enum(['own', 'direct', 'bara']).optional(),
  pref: z.string().optional(),
})

export async function POST(request: Request) {
  if (!gptAuthorized(request)) return unauthorized()
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  return callRpc('youkinavi_quote_set', {
    items: parsed.data.items,
    qty: parsed.data.qty,
    mode: parsed.data.mode ?? 'own',
    pref: parsed.data.pref ?? null,
  })
}
