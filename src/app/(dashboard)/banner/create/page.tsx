'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Loader2, Upload } from 'lucide-react'
import { CopyButton } from '@/components/shared/copy-button'
import { toast } from 'sonner'

export default function BannerCreatePage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mainText, setMainText] = useState('')
  const [subText, setSubText] = useState('')
  const [width, setWidth] = useState(800)
  const [height, setHeight] = useState(400)
  const [productImages, setProductImages] = useState('')
  const [referenceImageUrl, setReferenceImageUrl] = useState('')
  const [pageContext, setPageContext] = useState('')

  // GenSpark
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [promptLoading, setPromptLoading] = useState(false)

  // Gemini
  const [geminiResult, setGeminiResult] = useState('')
  const [geminiLoading, setGeminiLoading] = useState(false)

  // Upload result
  const [uploadLoading, setUploadLoading] = useState(false)
  const [resultImageUrl, setResultImageUrl] = useState('')

  function getProductImagesList() {
    return productImages.split('\n').map((s) => s.trim()).filter(Boolean)
  }

  async function handleGenSparkPrompt() {
    if (!mainText) {
      toast.error('メインテキストを入力してください')
      return
    }
    setPromptLoading(true)
    try {
      const res = await fetch('/api/banner/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_images: getProductImagesList(),
          main_text: mainText,
          sub_text: subText,
          width,
          height,
          page_context: pageContext,
          reference_image_url: referenceImageUrl || undefined,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error)
      }

      const data = await res.json()
      setGeneratedPrompt(data.prompt)
      toast.success('プロンプトを生成しました')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'プロンプト生成に失敗しました')
    } finally {
      setPromptLoading(false)
    }
  }

  async function handleGeminiGenerate() {
    if (!mainText) {
      toast.error('メインテキストを入力してください')
      return
    }
    setGeminiLoading(true)
    try {
      const res = await fetch('/api/banner/generate-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_images: getProductImagesList(),
          main_text: mainText,
          sub_text: subText,
          width,
          height,
          page_context: pageContext,
          template_pattern: 'default',
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error)
      }

      const data = await res.json()
      setGeminiResult(data.imageData)
      toast.success('生成が完了しました')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '画像生成に失敗しました')
    } finally {
      setGeminiLoading(false)
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('image_type', 'banner')

      const res = await fetch('/api/image/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error)
      }

      const data = await res.json()
      setResultImageUrl(data.s3_url)
      toast.success('画像をアップロードしました')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'アップロードに失敗しました')
    } finally {
      setUploadLoading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          戻る
        </Button>
      </div>

      <h1 className="text-2xl font-bold">バナー/ヘッダー画像生成</h1>

      {/* Common Settings */}
      <Card>
        <CardHeader>
          <CardTitle>共通設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>メインテキスト</Label>
              <Input value={mainText} onChange={(e) => setMainText(e.target.value)} placeholder="春の丼もの特集" />
            </div>
            <div className="space-y-2">
              <Label>サブテキスト</Label>
              <Input value={subText} onChange={(e) => setSubText(e.target.value)} placeholder="テイクアウトを華やかに" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>幅 (px)</Label>
              <Input type="number" value={width} onChange={(e) => setWidth(parseInt(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>高さ (px)</Label>
              <Input type="number" value={height} onChange={(e) => setHeight(parseInt(e.target.value))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>商品画像URL（1行に1URL）</Label>
            <Textarea
              value={productImages}
              onChange={(e) => setProductImages(e.target.value)}
              placeholder="https://s3.../products/xxx.jpg"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>ページコンテキスト</Label>
            <Textarea
              value={pageContext}
              onChange={(e) => setPageContext(e.target.value)}
              placeholder="春のテイクアウト需要に応える容器を厳選..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="genspark">
        <TabsList>
          <TabsTrigger value="genspark">GenSpark (プロンプト)</TabsTrigger>
          <TabsTrigger value="gemini">Gemini (実験)</TabsTrigger>
          <TabsTrigger value="manual">手動アップロード</TabsTrigger>
        </TabsList>

        <TabsContent value="genspark">
          <Card>
            <CardHeader>
              <CardTitle>GenSparkプロンプト生成</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>参考画像URL（過去のバナー等）</Label>
                <Input
                  value={referenceImageUrl}
                  onChange={(e) => setReferenceImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <Button onClick={handleGenSparkPrompt} disabled={promptLoading}>
                {promptLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                プロンプト生成
              </Button>
              {generatedPrompt && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>生成されたプロンプト</Label>
                    <CopyButton text={generatedPrompt} label="クリップボードにコピー" />
                  </div>
                  <Textarea value={generatedPrompt} readOnly rows={12} className="font-mono text-sm" />
                  <p className="text-sm text-muted-foreground">
                    上記プロンプトをGenSparkに貼り付けて画像を生成してください。
                    完成画像は下の「手動アップロード」タブからアップロードできます。
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gemini">
          <Card>
            <CardHeader>
              <CardTitle>Gemini画像生成（実験的）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={handleGeminiGenerate} disabled={geminiLoading}>
                {geminiLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                生成する
              </Button>
              {geminiResult && (
                <div className="space-y-2">
                  <Label>生成結果</Label>
                  <pre className="bg-muted p-4 rounded text-sm whitespace-pre-wrap">{geminiResult}</pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual">
          <Card>
            <CardHeader>
              <CardTitle>手動アップロード</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                GenSparkやその他のツールで作成した画像をここからアップロードできます。
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploadLoading}>
                <Upload className="mr-1 h-4 w-4" />
                {uploadLoading ? 'アップロード中...' : '画像を選択'}
              </Button>
              {resultImageUrl && (
                <div className="space-y-2">
                  <Label>アップロード完了</Label>
                  <img src={resultImageUrl} alt="Uploaded banner" className="max-h-48 rounded border" />
                  <div className="flex gap-2">
                    <CopyButton text={resultImageUrl} label="URLをコピー" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
