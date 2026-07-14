import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const MONTHLY_LIMIT = 60

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  // 当月の1日 00:00:00 を取得
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { data: logs, error } = await supabase
    .from('banner_generation_logs')
    .select('units')
    .eq('user_id', user.id)
    .eq('is_edit', false)
    .gte('created_at', monthStart)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const used = (logs || []).reduce((sum, l) => sum + (l.units ?? 1), 0)
  const remaining = Math.max(0, MONTHLY_LIMIT - used)
  const isOverLimit = used >= MONTHLY_LIMIT

  return NextResponse.json({
    used,
    limit: MONTHLY_LIMIT,
    remaining,
    isOverLimit,
    // 超過分の追加料金（1枚100円）
    extraCharge: isOverLimit ? (used - MONTHLY_LIMIT) * 100 : 0,
  })
}
