/** SFA APIルートの共通処理（メンバー確定・エラー整形） */
import { NextResponse } from 'next/server'
import { ZodError, type ZodType } from 'zod'
import { requireAdmin, requireMember, SfaAuthError, type SfaMember } from './member'
import { SfaError } from './service'

export function errorResponse(e: unknown) {
  if (e instanceof SfaAuthError || e instanceof SfaError) {
    const extra = (e as SfaError & { duplicates?: unknown }).duplicates
    return NextResponse.json({ error: e.message, ...(extra ? { duplicates: extra } : {}) }, { status: e.status })
  }
  if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? '入力が不正です' }, { status: 400 })
  console.error('[sfa api]', e)
  return NextResponse.json({ error: e instanceof Error ? e.message : '処理に失敗しました' }, { status: 500 })
}

export async function withMember(fn: (m: SfaMember) => Promise<unknown>, opts: { admin?: boolean } = {}) {
  try {
    const m = await requireMember()
    if (opts.admin) requireAdmin(m)
    const result = await fn(m)
    return result instanceof Response ? result : NextResponse.json(result ?? { ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  return schema.parse(await request.json().catch(() => ({})))
}

export const idParam = (v: string) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw new SfaError('IDが不正です')
  return n
}
