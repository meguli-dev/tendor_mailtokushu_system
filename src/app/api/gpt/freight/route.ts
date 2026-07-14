import { gptAuthorized, unauthorized, callRpc } from '@/lib/gpt-api'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  maker: z.string().optional(),
  pref: z.string().optional(),
})

export async function POST(request: Request) {
  if (!gptAuthorized(request)) return unauthorized()
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  return callRpc('youkinavi_freight', {
    p_maker: parsed.data.maker ?? null,
    p_pref: parsed.data.pref ?? null,
  })
}
