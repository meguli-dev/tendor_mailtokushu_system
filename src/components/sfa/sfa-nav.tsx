'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarCheck, Columns3, List, FileText, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/sfa', label: '今日', icon: CalendarCheck, match: (p: string) => p === '/sfa' },
  { href: '/sfa/pipeline', label: 'パイプライン', icon: Columns3, match: (p: string) => p.startsWith('/sfa/pipeline') },
  { href: '/sfa/deals', label: '案件一覧', icon: List, match: (p: string) => p.startsWith('/sfa/deals') },
  { href: '/sfa/quotes', label: '見積', icon: FileText, match: (p: string) => p.startsWith('/sfa/quotes') },
  { href: '/sfa/members', label: 'メンバー', icon: Users, match: (p: string) => p.startsWith('/sfa/members') },
]

export function SfaNav() {
  const pathname = usePathname()
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b pb-2">
      {TABS.map((t) => {
        const active = t.match(pathname)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors',
              active ? 'bg-secondary font-medium text-secondary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
