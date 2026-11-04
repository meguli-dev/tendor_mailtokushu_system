import { NextResponse } from 'next/server'
import { ZodError, type ZodType } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { MailError } from './service'

export function errorResponse(e: unknown) {
  if (e instanceof MailError) return NextResponse.json({ error: e.message }, { status: e.status })
  if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? '入力が正しくありません' }, { status: 400 })
  console.error('[mail]', e)
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
}

/** ログイン済み・外部営業（sales）以外だけが使える */
export async function withUser(fn: (userId: string) => Promise<unknown>) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 })
    if (user.app_metadata?.portal_role === 'sales') return NextResponse.json({ error: 'この機能を使う権限がありません' }, { status: 403 })
    const result = await fn(user.id)
    return result instanceof Response ? result : NextResponse.json(result ?? { ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  return schema.parse(await request.json().catch(() => ({})))
}

export function idParam(v: string): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw new MailError('IDが正しくありません', 400)
  return n
}
