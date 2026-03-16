'use client'

import { use, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { CopyButton } from '@/components/shared/copy-button'
import { useNewsletter, useExportNewsletter } from '@/hooks/use-newsletters'
import { toast } from 'sonner'

export default function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: newsletter } = useNewsletter(id)
  const exportMutation = useExportNewsletter()
  const [html, setHtml] = useState<string>('')

  useEffect(() => {
    if (newsletter?.html_output) {
      setHtml(newsletter.html_output)
    }
  }, [newsletter])

  async function handleExport() {
    try {
      const result = await exportMutation.mutateAsync(id)
      setHtml(result.html)
      toast.success('HTMLを生成しました')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'エクスポートに失敗しました')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          編集に戻る
        </Button>
        <div className="flex gap-2">
          <Button onClick={handleExport} disabled={exportMutation.isPending}>
            {exportMutation.isPending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              'HTML生成'
            )}
          </Button>
        </div>
      </div>

      <h1 className="text-2xl font-bold">HTML出力: {newsletter?.title}</h1>

      {html ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>HTMLソース</CardTitle>
                <CopyButton text={html} label="HTMLをコピー" />
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[600px] text-xs font-mono whitespace-pre-wrap">
                {html}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>プレビュー</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden bg-white">
                <iframe
                  srcDoc={html}
                  className="w-full min-h-[600px]"
                  sandbox="allow-same-origin"
                  title="メールプレビュー"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            「HTML生成」ボタンをクリックしてHTMLを生成してください
          </CardContent>
        </Card>
      )}

      {html && (
        <Card>
          <CardHeader>
            <CardTitle>Cunoteへの手順</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ol className="list-decimal list-inside space-y-1">
              <li>上のHTMLソースを「HTMLをコピー」ボタンでコピー</li>
              <li>Cunoteにログインし、新規メール作成画面を開く</li>
              <li>HTMLエディタモードに切り替え</li>
              <li>コピーしたHTMLを貼り付け</li>
              <li>プレビューで表示を確認</li>
              <li>配信先リストを選択して送信</li>
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
