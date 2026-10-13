import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // MCP / GPTs / Chatwork Webhook / Cron はSupabase Authではなく各routeで検証する（Bearerキー・署名・CRON_SECRET）
  const p = request.nextUrl.pathname
  if (p.startsWith('/api/mcp') || p.startsWith('/api/gpt') || p.startsWith('/api/sfa/mcp') ||
      p.startsWith('/api/chatwork/webhook') || p.startsWith('/api/cron/')) {
    return NextResponse.next({ request })
  }

  // プライバシーポリシーは公開ページ（GPTs ActionsのPrivacy Policy URL用）
  if (request.nextUrl.pathname === '/privacy') {
    return NextResponse.next({ request })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/api/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const salesOnly = user?.app_metadata?.portal_role === 'sales'

  if (user && request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = salesOnly ? '/sfa' : '/'
    return NextResponse.redirect(url)
  }

  // 外部営業（portal_role=sales）はSFAのみ。メルマガ・特集・見積りAI（原価）には入れない
  if (salesOnly && !(p === '/sfa' || p.startsWith('/sfa/') || p.startsWith('/api/sfa/') || p.startsWith('/api/auth'))) {
    if (p.startsWith('/api/')) return NextResponse.json({ error: 'この機能を使う権限がありません' }, { status: 403 })
    const url = request.nextUrl.clone()
    url.pathname = '/sfa'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
