/**
 * GPTs Actions 用APIの共通処理
 * 認証: Authorization: Bearer ${YOUKINAVI_GPT_KEY}
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export function gptAuthorized(request: Request): boolean {
  const key = process.env.YOUKINAVI_GPT_KEY
  if (!key) return false
  return (request.headers.get('authorization') || '') === `Bearer ${key}`
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function callRpc(fn: string, args: Record<string, unknown>) {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc(fn, args)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
