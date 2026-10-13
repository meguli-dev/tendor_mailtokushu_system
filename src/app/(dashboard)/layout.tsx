import { Header } from '@/components/layout/header'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // 外部営業（portal_role=sales）にはSFA以外のモジュールを表示しない（アクセス自体はmiddlewareで遮断）
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const salesOnly = user?.app_metadata?.portal_role === 'sales'

  return (
    <div className="min-h-screen bg-muted/30">
      <Header salesOnly={salesOnly} />
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
