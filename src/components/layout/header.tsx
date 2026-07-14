'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LogOut, Image, LayoutTemplate, Settings, Mail, Newspaper, Calculator, Database } from 'lucide-react'

const MODULES = [
  { href: '/', label: 'メルマガビルダー', icon: Mail, match: (p: string) => p === '/' || p.startsWith('/newsletter') || p.startsWith('/banner') },
  { href: '/feature', label: '特集ページ', icon: Newspaper, match: (p: string) => p.startsWith('/feature') },
  { href: '/quote', label: '見積りAI', icon: Calculator, match: (p: string) => p.startsWith('/quote') },
]

export function Header() {
  const router = useRouter()
  const pathname = usePathname()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const inNewsletterModule = MODULES[0].match(pathname) || pathname.startsWith('/templates') || pathname.startsWith('/images') || pathname.startsWith('/settings')

  return (
    <header className="border-b bg-background">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-lg">
            容器なび 業務ポータル
          </Link>
          <nav className="flex items-center gap-1">
            {MODULES.map((m) => {
              const active = m.match(pathname)
              return (
                <Button key={m.href} variant={active ? 'secondary' : 'ghost'} size="sm" asChild>
                  <Link href={m.href}>
                    <m.icon className="mr-1 h-4 w-4" />
                    {m.label}
                  </Link>
                </Button>
              )
            })}
          </nav>
        </div>
        <nav className="flex items-center gap-2">
          {inNewsletterModule && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/templates">
                  <LayoutTemplate className="mr-1 h-4 w-4" />
                  テンプレート
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/images">
                  <Image className="mr-1 h-4 w-4" />
                  画像管理
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/settings/banner-tonmana">
                  <Settings className="mr-1 h-4 w-4" />
                  トンマナ設定
                </Link>
              </Button>
            </>
          )}
          {pathname.startsWith('/quote') && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/quote/master">
                  <Database className="mr-1 h-4 w-4" />
                  原価マスタ
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/quote/settings">
                  <Settings className="mr-1 h-4 w-4" />
                  見積り設定
                </Link>
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-1 h-4 w-4" />
            ログアウト
          </Button>
        </nav>
      </div>
    </header>
  )
}
