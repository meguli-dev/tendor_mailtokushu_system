import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Mail, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FeaturePageStatusBadge } from '@/components/shared/status-badge'
import { NewsletterList } from '@/components/newsletter/newsletter-list'
import type { Newsletter, FeaturePage } from '@/types'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: newsletters } = await supabase
    .from('newsletters')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: featurePages } = await supabase
    .from('feature_pages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <div className="space-y-8">
      <div className="flex gap-4">
        <Button asChild>
          <Link href="/newsletter/new">
            <Plus className="mr-1 h-4 w-4" />
            メルマガ作成
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/feature/new">
            <Plus className="mr-1 h-4 w-4" />
            特集ページ作成
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            最近のメルマガ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NewsletterList newsletters={(newsletters as Newsletter[]) || []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            最近の特集ページ
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!featurePages?.length ? (
            <p className="text-muted-foreground text-sm">特集ページがありません</p>
          ) : (
            <div className="space-y-2">
              {(featurePages as FeaturePage[]).map((fp) => (
                <div key={fp.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{fp.title}</span>
                    <FeaturePageStatusBadge status={fp.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {new Date(fp.created_at).toLocaleDateString('ja-JP')}
                    </span>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/feature/${fp.id}`}>編集</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
