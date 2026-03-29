'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LogOut, Image, LayoutTemplate, Settings } from 'lucide-react'
import { toast } from 'sonner'

export function Header() {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="border-b bg-background">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="font-bold text-lg">
          容器なび メルマガビルダー
        </Link>
        <nav className="flex items-center gap-2">
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
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-1 h-4 w-4" />
            ログアウト
          </Button>
        </nav>
      </div>
    </header>
  )
}
