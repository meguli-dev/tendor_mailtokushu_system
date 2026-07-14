'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Plus, ArrowLeft, ArrowRight, Loader2, Sparkles, Code, Trash2, Palette, ImageIcon, ShoppingBag } from 'lucide-react'
import { ProductInput, type ProductData } from '@/components/newsletter/product-input'
import { CopyButton } from '@/components/shared/copy-button'
import {
  useCreateFeaturePage,
  useUpdateFeaturePage,
  useExportFeaturePage,
  useGenerateFeatureContent,
} from '@/hooks/use-feature-pages'
import { FEATURE_TEMPLATE_DEFS, PRESET_COLORS } from '@/lib/feature-templates'
import { toast } from 'sonner'
import type { FeaturePageWithProducts, FeatureTemplateType, FeaturePageDraftData, FeatureContentZoneItem, FeaturePickupProduct } from '@/types'

interface FeaturePageFormProps {
  featurePage?: FeaturePageWithProducts
}

const emptyProduct: ProductData = {
  product_url: '',
  product_name: null,
  product_image_url: null,
  s3_image_url: null,
  sort_order: 0,
  is_ranking: false,
  rank_position: null,
}

const DIRECTION_EXAMPLES = [
  '新商品の耐熱性をアピールしたい',
  'コスパの良さを前面に出して訴求したい',
  'テイクアウト需要に合わせた提案をしたい',
  'ランチ営業向けの利用シーンを紹介したい',
  'サイズバリエーションの選び方を分かりやすく',
]

export function FeaturePageForm({ featurePage }: FeaturePageFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const createMutation = useCreateFeaturePage()
  const updateMutation = useUpdateFeaturePage()
  const exportMutation = useExportFeaturePage()
  const generateMutation = useGenerateFeatureContent()

  const isEditing = !!featurePage
  const hasExistingHtml = !!featurePage?.html_output
  const draft = featurePage?.draft_data

  // Step management
  const [currentStep, setCurrentStep] = useState(
    hasExistingHtml ? 3 : draft?.aiGenerated ? 2 : 1
  )

  // Feature page ID (set after creation)
  const [pageId, setPageId] = useState(featurePage?.id || '')

  // Step 1: Basic info
  const [title, setTitle] = useState(featurePage?.title || '')
  const [templateType, setTemplateType] = useState<FeatureTemplateType | null>(
    featurePage?.template_type || null
  )
  const [themeColor, setThemeColor] = useState(featurePage?.theme_color || '#e8690a')
  const [headerImageUrl, setHeaderImageUrl] = useState(
    draft?.formFields?.heroImageUrl || featurePage?.header_image_url || ''
  )
  const [directionMemo, setDirectionMemo] = useState(draft?.formFields?.directionMemo || '')
  const [products, setProducts] = useState<ProductData[]>(() => {
    if (!featurePage?.products?.length) return [{ ...emptyProduct }]
    return featurePage.products.map((p) => ({
      product_url: p.product_url,
      product_name: p.product_name,
      product_image_url: null,
      s3_image_url: p.s3_image_url,
      sort_order: p.sort_order,
      is_ranking: false,
      rank_position: null,
    }))
  })

  // Step 2: AI-generated content (editable) - shared fields
  const [ctaText, setCtaText] = useState(draft?.formFields?.ctaText || '')
  const [ctaUrl, setCtaUrl] = useState(draft?.formFields?.ctaUrl || '')

  // Template A fields
  const [badgeText, setBadgeText] = useState(draft?.formFields?.badgeText || '')
  const [problemSectionTitle, setProblemSectionTitle] = useState(draft?.formFields?.problemSectionTitle || '')
  const [problemBefore, setProblemBefore] = useState<string[]>(draft?.formFields?.problemBefore || [])
  const [problemAfter, setProblemAfter] = useState<string[]>(draft?.formFields?.problemAfter || [])
  const [solutionText, setSolutionText] = useState(draft?.formFields?.solutionText || '')
  const [mainFeatures, setMainFeatures] = useState<Array<{ title: string; description: string }>>(
    draft?.formFields?.mainFeatures || []
  )
  const [subFeatures, setSubFeatures] = useState<string[]>(draft?.formFields?.subFeatures || [])
  const [useCases, setUseCases] = useState<Array<{ title: string; description: string }>>(
    draft?.formFields?.useCases || []
  )
  const [sizeGuide, setSizeGuide] = useState<Array<{ label: string; specs: string; description: string }>>(
    draft?.formFields?.sizeGuide || []
  )
  const [faqItems, setFaqItems] = useState<Array<{ question: string; answer: string }>>(
    draft?.formFields?.faqItems || []
  )
  const [sizeGuideTitle, setSizeGuideTitle] = useState(draft?.formFields?.sizeGuideTitle || '')

  // Template B fields
  const [introText, setIntroText] = useState(draft?.formFields?.introText || '')
  const [recommendDescriptions, setRecommendDescriptions] = useState<string[]>(draft?.formFields?.recommendDescriptions || [])
  const [selectionGuideTitle, setSelectionGuideTitle] = useState(draft?.formFields?.selectionGuideTitle || '')
  const [selectionGuideText, setSelectionGuideText] = useState(draft?.formFields?.selectionGuideText || '')
  const [selectionGuideCards, setSelectionGuideCards] = useState<Array<{ title: string; description: string }>>(
    draft?.formFields?.selectionGuideCards || []
  )

  // Template C fields
  const [appealText, setAppealText] = useState(draft?.formFields?.appealText || '')
  const [productDescriptions, setProductDescriptions] = useState<string[]>(
    draft?.formFields?.productDescriptions || []
  )

  // 共通: コンテンツゾーン
  const [contentZone, setContentZone] = useState<FeatureContentZoneItem[]>(
    draft?.formFields?.contentZone || []
  )

  // 共通: おすすめ商品（ピックアップ）
  const [pickupSectionTitle, setPickupSectionTitle] = useState(
    draft?.formFields?.pickupSectionTitle || 'おすすめ商品'
  )
  const [pickupProducts, setPickupProducts] = useState<FeaturePickupProduct[]>(
    draft?.formFields?.pickupProducts || []
  )
  const [scrapingPickupIds, setScrapingPickupIds] = useState<Set<string>>(new Set())

  // Step 3: HTML
  const [generatedHtml, setGeneratedHtml] = useState(featurePage?.html_output || '')
  const [editableHtml, setEditableHtml] = useState(featurePage?.html_output || '')
  const previewIframeRef = useRef<HTMLIFrameElement>(null)

  // Auto-save draft (Step 2)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveDraft = useCallback(async () => {
    if (!pageId || currentStep !== 2) return
    const draftData = buildDraftData()
    try {
      await updateMutation.mutateAsync({ id: pageId, data: { draft_data: draftData } })
    } catch {
      // silent
    }
  }, [pageId, currentStep, title, templateType, themeColor, headerImageUrl, directionMemo,
    ctaText, ctaUrl, badgeText, problemSectionTitle, problemBefore, problemAfter,
    solutionText, mainFeatures, subFeatures, useCases, sizeGuide, sizeGuideTitle, faqItems,
    introText, recommendDescriptions, selectionGuideTitle, selectionGuideText, selectionGuideCards,
    appealText, productDescriptions, contentZone, pickupProducts, pickupSectionTitle])

  useEffect(() => {
    if (currentStep !== 2) return
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => saveDraft(), 5000)
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current) }
  }, [saveDraft, currentStep])

  // Update iframe preview
  useEffect(() => {
    if (previewIframeRef.current && generatedHtml) {
      const doc = previewIframeRef.current.contentDocument
      if (doc) {
        doc.open()
        doc.write(generatedHtml)
        doc.close()
      }
    }
  }, [generatedHtml])

  function buildDraftData(): FeaturePageDraftData {
    const formFields: FeaturePageDraftData['formFields'] = {
      heroImageUrl: headerImageUrl,
      directionMemo,
      ctaText,
      ctaUrl,
    }
    if (templateType === 'new_product') {
      Object.assign(formFields, {
        badgeText, problemSectionTitle, problemBefore, problemAfter,
        solutionText, mainFeatures, subFeatures, useCases, sizeGuide, sizeGuideTitle, faqItems,
      })
    } else if (templateType === 'category') {
      Object.assign(formFields, {
        introText, recommendDescriptions, selectionGuideTitle, selectionGuideText, selectionGuideCards,
        useCases, faqItems,
      })
    } else if (templateType === 'simple') {
      Object.assign(formFields, { appealText, productDescriptions })
    }
    // 共通フィールド
    if (contentZone.length > 0) formFields.contentZone = contentZone
    if (pickupProducts.length > 0) {
      formFields.pickupProducts = pickupProducts
      formFields.pickupSectionTitle = pickupSectionTitle
    }
    return { formFields, aiGenerated: true }
  }

  function updateProduct(index: number, data: Partial<ProductData>) {
    setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, ...data } : p)))
  }

  function removeProduct(index: number) {
    setProducts((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleScrapePickup(itemId: string) {
    const item = pickupProducts.find(p => p.id === itemId)
    if (!item?.product_url) { toast.error('URLを入力してください'); return }
    setScrapingPickupIds(prev => new Set(prev).add(itemId))
    try {
      const res = await fetch('/api/product/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_url: item.product_url, auto_upload_s3: true }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '取得に失敗しました')
      }
      const data = await res.json()
      setPickupProducts(prev => prev.map(p => p.id === itemId ? {
        ...p,
        product_name: data.product_name || p.product_name,
        product_image_url: data.s3_image_url || data.original_image_url || p.product_image_url,
      } : p))
      toast.success(`${data.product_name} を取得しました`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '取得に失敗しました')
    } finally {
      setScrapingPickupIds(prev => { const next = new Set(prev); next.delete(itemId); return next })
    }
  }

  // Step 1 → Step 2: AI content generation
  async function handleGetAIContent() {
    if (!title) { toast.error('タイトルを入力してください'); return }
    if (!templateType) { toast.error('テンプレートを選択してください'); return }
    if (!products.some(p => p.product_url)) { toast.error('商品を1つ以上登録してください'); return }

    try {
      let currentPageId = pageId

      // Create page if not yet saved
      if (!currentPageId) {
        const created = await createMutation.mutateAsync({
          title,
          template_type: templateType,
          theme_color: themeColor,
        })
        currentPageId = created.id
        setPageId(currentPageId)
      } else {
        await updateMutation.mutateAsync({
          id: currentPageId,
          data: { title, template_type: templateType, theme_color: themeColor },
        })
      }

      // Save products
      const validProducts = products.filter(p => p.product_url)
      await updateMutation.mutateAsync({
        id: currentPageId,
        data: {
          header_image_url: headerImageUrl || null,
          products: validProducts.map((p, i) => ({
            product_url: p.product_url,
            product_name: p.product_name,
            s3_image_url: p.s3_image_url,
            description: null,
            sort_order: i,
          })),
        },
      })

      // Generate AI content
      const result = await generateMutation.mutateAsync({
        id: currentPageId,
        templateType,
        directionMemo: directionMemo || undefined,
      })

      // Map AI response to form fields
      applyAIContent(templateType, result.content)

      // Save draft
      const draftData = buildDraftData()
      await updateMutation.mutateAsync({ id: currentPageId, data: { draft_data: draftData } })

      setCurrentStep(2)
      toast.success('AIがコンテンツを生成しました')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'コンテンツ生成に失敗しました')
    }
  }

  function applyAIContent(type: FeatureTemplateType, content: Record<string, unknown>) {
    setCtaText((content.cta_text as string) || 'お買い物はこちら')
    setCtaUrl('')

    if (type === 'new_product') {
      setBadgeText((content.badge_text as string) || '')
      setProblemSectionTitle((content.problem_section_title as string) || '')
      setProblemBefore((content.problem_before as string[]) || [])
      setProblemAfter((content.problem_after as string[]) || [])
      setSolutionText((content.solution_text as string) || '')
      setMainFeatures((content.main_features as Array<{ title: string; description: string }>) || [])
      setSubFeatures((content.sub_features as string[]) || [])
      setUseCases((content.use_cases as Array<{ title: string; description: string }>) || [])
      setSizeGuide((content.size_guide as Array<{ label: string; specs: string; description: string }>) || [])
      setSizeGuideTitle((content.size_guide_title as string) || 'サイズの選び方')
      setFaqItems((content.faq as Array<{ question: string; answer: string }>) || [])
    } else if (type === 'category') {
      setIntroText((content.intro_text as string) || '')
      setRecommendDescriptions((content.recommend_descriptions as string[]) || [])
      setSelectionGuideTitle((content.selection_guide_title as string) || '選び方ガイド')
      setSelectionGuideCards((content.selection_guide_cards as Array<{ title: string; description: string }>) || [])
      setUseCases((content.use_cases as Array<{ title: string; description: string }>) || [])
      setFaqItems((content.faq as Array<{ question: string; answer: string }>) || [])
    } else if (type === 'simple') {
      setAppealText((content.appeal_text as string) || '')
      setProductDescriptions((content.product_descriptions as string[]) || [])
    }
  }

  // Step 2 → Step 3: HTML export
  async function handleExportHtml() {
    if (!pageId) return

    try {
      // Save draft + products with descriptions
      const draftData = buildDraftData()
      const validProducts = products.filter(p => p.product_url)
      await updateMutation.mutateAsync({
        id: pageId,
        data: {
          title,
          template_type: templateType,
          theme_color: themeColor,
          header_image_url: headerImageUrl || null,
          draft_data: draftData,
          products: validProducts.map((p, i) => ({
            product_url: p.product_url,
            product_name: p.product_name,
            s3_image_url: p.s3_image_url,
            description: productDescriptions[i] || null,
            sort_order: i,
          })),
        },
      })

      const result = await exportMutation.mutateAsync({ id: pageId })
      setGeneratedHtml(result.html)
      setEditableHtml(result.html)
      setCurrentStep(3)
      toast.success('HTMLを生成しました')

      queryClient.invalidateQueries({ queryKey: ['feature-page', pageId] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'HTML生成に失敗しました')
    }
  }

  function handleApplyHtmlEdit() {
    setGeneratedHtml(editableHtml)
    toast.success('プレビューに反映しました')
  }

  function handleBackToStep1() {
    if (currentStep === 2) saveDraft()
    setCurrentStep(1)
  }

  const isProcessing = createMutation.isPending || updateMutation.isPending ||
    generateMutation.isPending || exportMutation.isPending

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => {
          if (currentStep > 1 && !hasExistingHtml) {
            handleBackToStep1()
          } else {
            router.push('/feature')
          }
        }}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {currentStep === 2 ? '基本情報に戻る'
            : currentStep === 3 && !hasExistingHtml ? '内容設定に戻る'
            : 'ダッシュボードへ'}
        </Button>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {[
          { num: 1, label: 'テンプレート・商品登録' },
          { num: 2, label: 'コンテンツ設定' },
          { num: 3, label: 'HTML生成・プレビュー' },
        ].map((step) => (
          <div key={step.num} className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
              currentStep >= step.num
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}>
              {step.num}
            </div>
            <span className={`text-sm hidden sm:inline ${
              currentStep >= step.num ? 'text-foreground' : 'text-muted-foreground'
            }`}>{step.label}</span>
            {step.num < 3 && <div className="w-8 h-px bg-border" />}
          </div>
        ))}
      </div>

      {/* ===== Step 1: テンプレート・商品登録 ===== */}
      {currentStep === 1 && (
        <div className="space-y-6">
          {/* タイトル */}
          <Card>
            <CardHeader>
              <CardTitle>特集タイトル</CardTitle>
              <CardDescription>特集ページのタイトルを入力してください</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: 春のテイクアウト容器特集、新商品オードブルBOX"
                className="text-lg"
              />
            </CardContent>
          </Card>

          {/* テンプレート選択 */}
          <Card>
            <CardHeader>
              <CardTitle>テンプレート選択</CardTitle>
              <CardDescription>特集ページの構成パターンを選んでください</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {FEATURE_TEMPLATE_DEFS.map((tmpl) => (
                  <button
                    key={tmpl.type}
                    type="button"
                    onClick={() => setTemplateType(tmpl.type)}
                    className={`rounded-lg border-2 p-4 text-left transition-colors ${
                      templateType === tmpl.type
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <p className="font-bold mb-1">{tmpl.name}</p>
                    <p className="text-xs text-muted-foreground mb-2">{tmpl.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {tmpl.sections.map((s) => (
                        <span key={s} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                          {s}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* テーマカラー */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                テーマカラー
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 flex-wrap">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color.hex}
                    type="button"
                    onClick={() => setThemeColor(color.hex)}
                    className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 transition-colors ${
                      themeColor === color.hex
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full" style={{ backgroundColor: color.hex }} />
                    <span className="text-sm">{color.label}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ヘッダー画像 */}
          <Card>
            <CardHeader>
              <CardTitle>ヘッダー画像URL（任意）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                value={headerImageUrl}
                onChange={(e) => setHeaderImageUrl(e.target.value)}
                placeholder="https://..."
              />
              {headerImageUrl && (
                <img src={headerImageUrl} alt="ヘッダープレビュー" className="max-h-40 rounded border" />
              )}
            </CardContent>
          </Card>

          {/* 商品登録 */}
          <Card>
            <CardHeader>
              <CardTitle>商品登録</CardTitle>
              <CardDescription>特集に掲載する商品を登録してください</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {products.map((product, index) => (
                <ProductInput
                  key={index}
                  product={product}
                  index={index}
                  onUpdate={updateProduct}
                  onRemove={removeProduct}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setProducts((prev) => [...prev, { ...emptyProduct, sort_order: prev.length }])}
                className="w-full"
              >
                <Plus className="mr-1 h-4 w-4" />
                商品を追加
              </Button>
            </CardContent>
          </Card>

          {/* 方向性メモ */}
          <Card>
            <CardHeader>
              <CardTitle>方向性・指示（任意）</CardTitle>
              <CardDescription>AIへの指示やページの方向性を入力してください</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={directionMemo}
                onChange={(e) => setDirectionMemo(e.target.value)}
                placeholder="どんなページにしたいか、訴求ポイントなどを自由に記入"
                rows={3}
              />
              <div className="flex flex-wrap gap-2">
                {DIRECTION_EXAMPLES.map((ex) => (
                  <Button
                    key={ex}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setDirectionMemo((prev) => prev ? `${prev}\n${ex}` : ex)}
                  >
                    {ex}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* AI生成ボタン */}
          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleGetAIContent}
              disabled={isProcessing}
            >
              {generateMutation.isPending || createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  AIがコンテンツを生成中...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  AIに構成提案させる
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ===== Step 2: コンテンツ設定 ===== */}
      {currentStep === 2 && (
        <div className="space-y-6">
          {/* AI生成通知 */}
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
            <CardContent className="py-4">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <Sparkles className="inline mr-1 h-4 w-4" />
                AIが生成したコンテンツです。各項目を確認・編集してください。
              </p>
            </CardContent>
          </Card>

          {/* Template A: 新商品紹介型 */}
          {templateType === 'new_product' && (
            <>
              <Card>
                <CardHeader><CardTitle>バッジテキスト</CardTitle></CardHeader>
                <CardContent>
                  <Input value={badgeText} onChange={(e) => setBadgeText(e.target.value)} placeholder="例: 新商品、注目" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>課題提起セクション</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>セクションタイトル</Label>
                    <Input value={problemSectionTitle} onChange={(e) => setProblemSectionTitle(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>従来の課題（Before）</Label>
                      {problemBefore.map((item, i) => (
                        <div key={i} className="flex gap-2">
                          <Input value={item} onChange={(e) => {
                            const next = [...problemBefore]; next[i] = e.target.value; setProblemBefore(next)
                          }} />
                          <Button variant="ghost" size="icon" onClick={() => setProblemBefore(prev => prev.filter((_, idx) => idx !== i))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => setProblemBefore(prev => [...prev, ''])}>
                        <Plus className="mr-1 h-3 w-3" />追加
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label>解決後のメリット（After）</Label>
                      {problemAfter.map((item, i) => (
                        <div key={i} className="flex gap-2">
                          <Input value={item} onChange={(e) => {
                            const next = [...problemAfter]; next[i] = e.target.value; setProblemAfter(next)
                          }} />
                          <Button variant="ghost" size="icon" onClick={() => setProblemAfter(prev => prev.filter((_, idx) => idx !== i))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => setProblemAfter(prev => [...prev, ''])}>
                        <Plus className="mr-1 h-3 w-3" />追加
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>解決策キャッチコピー</Label>
                    <Input value={solutionText} onChange={(e) => setSolutionText(e.target.value)} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>特長（メイン）</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {mainFeatures.map((feat, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-1">
                        <Input value={feat.title} placeholder="特長タイトル" onChange={(e) => {
                          const next = [...mainFeatures]; next[i] = { ...next[i], title: e.target.value }; setMainFeatures(next)
                        }} />
                        <Textarea value={feat.description} placeholder="説明" rows={2} onChange={(e) => {
                          const next = [...mainFeatures]; next[i] = { ...next[i], description: e.target.value }; setMainFeatures(next)
                        }} />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setMainFeatures(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setMainFeatures(prev => [...prev, { title: '', description: '' }])}>
                    <Plus className="mr-1 h-3 w-3" />特長を追加
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>特長（サブ）</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {subFeatures.map((feat, i) => (
                    <div key={i} className="flex gap-2">
                      <Input value={feat} onChange={(e) => {
                        const next = [...subFeatures]; next[i] = e.target.value; setSubFeatures(next)
                      }} />
                      <Button variant="ghost" size="icon" onClick={() => setSubFeatures(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setSubFeatures(prev => [...prev, ''])}>
                    <Plus className="mr-1 h-3 w-3" />追加
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>利用シーン</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {useCases.map((uc, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-1">
                        <Input value={uc.title} placeholder="シーンタイトル" onChange={(e) => {
                          const next = [...useCases]; next[i] = { ...next[i], title: e.target.value }; setUseCases(next)
                        }} />
                        <Textarea value={uc.description} placeholder="説明" rows={2} onChange={(e) => {
                          const next = [...useCases]; next[i] = { ...next[i], description: e.target.value }; setUseCases(next)
                        }} />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setUseCases(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setUseCases(prev => [...prev, { title: '', description: '' }])}>
                    <Plus className="mr-1 h-3 w-3" />シーンを追加
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>選び方ガイド</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {sizeGuide.map((sg, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-1">
                        <Input value={sg.label} placeholder="ラベル" onChange={(e) => {
                          const next = [...sizeGuide]; next[i] = { ...next[i], label: e.target.value }; setSizeGuide(next)
                        }} />
                        <Input value={sg.specs} placeholder="スペック" onChange={(e) => {
                          const next = [...sizeGuide]; next[i] = { ...next[i], specs: e.target.value }; setSizeGuide(next)
                        }} />
                        <Input value={sg.description} placeholder="説明" onChange={(e) => {
                          const next = [...sizeGuide]; next[i] = { ...next[i], description: e.target.value }; setSizeGuide(next)
                        }} />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setSizeGuide(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setSizeGuide(prev => [...prev, { label: '', specs: '', description: '' }])}>
                    <Plus className="mr-1 h-3 w-3" />追加
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>FAQ</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {faqItems.map((faq, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-1">
                        <Input value={faq.question} placeholder="質問" onChange={(e) => {
                          const next = [...faqItems]; next[i] = { ...next[i], question: e.target.value }; setFaqItems(next)
                        }} />
                        <Textarea value={faq.answer} placeholder="回答" rows={2} onChange={(e) => {
                          const next = [...faqItems]; next[i] = { ...next[i], answer: e.target.value }; setFaqItems(next)
                        }} />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setFaqItems(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setFaqItems(prev => [...prev, { question: '', answer: '' }])}>
                    <Plus className="mr-1 h-3 w-3" />追加
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* Template B: カテゴリ特集型 */}
          {templateType === 'category' && (
            <>
              <Card>
                <CardHeader><CardTitle>導入文</CardTitle></CardHeader>
                <CardContent>
                  <Textarea value={introText} onChange={(e) => setIntroText(e.target.value)} rows={4} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>おすすめ商品の説明文</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {recommendDescriptions.map((desc, i) => (
                    <div key={i} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">商品{i + 1}の説明</Label>
                      <Textarea value={desc} rows={2} onChange={(e) => {
                        const next = [...recommendDescriptions]; next[i] = e.target.value; setRecommendDescriptions(next)
                      }} />
                    </div>
                  ))}
                  {recommendDescriptions.length === 0 && (
                    <p className="text-sm text-muted-foreground">商品説明はAI生成後に表示されます</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>選び方ガイド</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>セクションタイトル</Label>
                    <Input value={selectionGuideTitle} onChange={(e) => setSelectionGuideTitle(e.target.value)} placeholder="選び方ガイド" />
                  </div>
                  {selectionGuideCards.map((card, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-1">
                        <Input value={card.title} placeholder="ポイントのタイトル" onChange={(e) => {
                          const next = [...selectionGuideCards]; next[i] = { ...next[i], title: e.target.value }; setSelectionGuideCards(next)
                        }} />
                        <Textarea value={card.description} placeholder="説明" rows={2} onChange={(e) => {
                          const next = [...selectionGuideCards]; next[i] = { ...next[i], description: e.target.value }; setSelectionGuideCards(next)
                        }} />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setSelectionGuideCards(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setSelectionGuideCards(prev => [...prev, { title: '', description: '' }])}>
                    <Plus className="mr-1 h-3 w-3" />ポイントを追加
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>利用シーン</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {useCases.map((uc, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-1">
                        <Input value={uc.title} placeholder="シーンタイトル" onChange={(e) => {
                          const next = [...useCases]; next[i] = { ...next[i], title: e.target.value }; setUseCases(next)
                        }} />
                        <Textarea value={uc.description} placeholder="説明" rows={2} onChange={(e) => {
                          const next = [...useCases]; next[i] = { ...next[i], description: e.target.value }; setUseCases(next)
                        }} />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setUseCases(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setUseCases(prev => [...prev, { title: '', description: '' }])}>
                    <Plus className="mr-1 h-3 w-3" />シーンを追加
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>FAQ</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {faqItems.map((faq, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1 space-y-1">
                        <Input value={faq.question} placeholder="質問" onChange={(e) => {
                          const next = [...faqItems]; next[i] = { ...next[i], question: e.target.value }; setFaqItems(next)
                        }} />
                        <Textarea value={faq.answer} placeholder="回答" rows={2} onChange={(e) => {
                          const next = [...faqItems]; next[i] = { ...next[i], answer: e.target.value }; setFaqItems(next)
                        }} />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setFaqItems(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setFaqItems(prev => [...prev, { question: '', answer: '' }])}>
                    <Plus className="mr-1 h-3 w-3" />追加
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* Template C: シンプル訴求型 */}
          {templateType === 'simple' && (
            <Card>
              <CardHeader><CardTitle>訴求テキスト</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={appealText} onChange={(e) => setAppealText(e.target.value)} rows={4} />
              </CardContent>
            </Card>
          )}

          {/* おすすめ商品（共通） */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                おすすめ商品
              </CardTitle>
              <CardDescription>「他のおすすめ容器」として紹介する商品を登録（画像・商品名・説明・リンク）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>セクションタイトル</Label>
                <Input
                  value={pickupSectionTitle}
                  onChange={(e) => setPickupSectionTitle(e.target.value)}
                  placeholder="おすすめ商品"
                />
              </div>
              {pickupProducts.map((item, i) => {
                const isScraping = scrapingPickupIds.has(item.id)
                return (
                <div key={item.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">商品 {i + 1}</Label>
                    <Button variant="ghost" size="icon" onClick={() => setPickupProducts(prev => prev.filter(p => p.id !== item.id))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* URL入力 + 自動取得 */}
                  <div className="flex gap-2">
                    <Input
                      value={item.product_url}
                      placeholder="https://yo-ki-navi.com/product.php?id=..."
                      className="flex-1"
                      onChange={(e) => {
                        setPickupProducts(prev => prev.map(p => p.id === item.id ? { ...p, product_url: e.target.value } : p))
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleScrapePickup(item.id)}
                      disabled={isScraping}
                    >
                      {isScraping ? <Loader2 className="h-4 w-4 animate-spin" /> : '取得'}
                    </Button>
                  </div>
                  {/* 取得済み or 手動入力フィールド */}
                  {item.product_name && (
                    <div className="flex items-center gap-3 text-sm">
                      {item.product_image_url && (
                        <img src={item.product_image_url} alt={item.product_name} className="h-16 w-16 rounded border object-contain flex-shrink-0" />
                      )}
                      <span className="font-medium">{item.product_name}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">商品名</Label>
                      <Input value={item.product_name} placeholder="自動取得 or 手動入力" onChange={(e) => {
                        setPickupProducts(prev => prev.map(p => p.id === item.id ? { ...p, product_name: e.target.value } : p))
                      }} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">バッジ（任意）</Label>
                      <Input value={item.badge} placeholder="例: 人気No.1、NEW" onChange={(e) => {
                        setPickupProducts(prev => prev.map(p => p.id === item.id ? { ...p, badge: e.target.value } : p))
                      }} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">商品画像URL</Label>
                    <Input value={item.product_image_url} placeholder="自動取得 or 手動入力" onChange={(e) => {
                      setPickupProducts(prev => prev.map(p => p.id === item.id ? { ...p, product_image_url: e.target.value } : p))
                    }} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">説明文</Label>
                    <Textarea value={item.description} rows={2} placeholder="商品の説明・おすすめポイント" onChange={(e) => {
                      setPickupProducts(prev => prev.map(p => p.id === item.id ? { ...p, description: e.target.value } : p))
                    }} />
                  </div>
                </div>
                )
              })}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setPickupProducts(prev => [...prev, {
                  id: crypto.randomUUID(),
                  product_url: '',
                  product_name: '',
                  product_image_url: '',
                  description: '',
                  badge: '',
                }])}
              >
                <Plus className="mr-1 h-4 w-4" />
                おすすめ商品を追加
              </Button>
            </CardContent>
          </Card>

          {/* コンテンツゾーン（共通） */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                コンテンツゾーン
              </CardTitle>
              <CardDescription>バナーやリンク付き画像を自由に配置できるエリア（画像・リンク先・コメント）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {contentZone.map((block, i) => (
                <div key={block.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">ブロック {i + 1}</Label>
                    <Button variant="ghost" size="icon" onClick={() => setContentZone(prev => prev.filter(b => b.id !== block.id))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">画像URL</Label>
                    <Input value={block.image_url} placeholder="https://..." onChange={(e) => {
                      setContentZone(prev => prev.map(b => b.id === block.id ? { ...b, image_url: e.target.value } : b))
                    }} />
                  </div>
                  {block.image_url && (
                    <img src={block.image_url} alt={`コンテンツ${i + 1}`} className="max-h-24 rounded border" />
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs">リンク先URL</Label>
                    <Input value={block.link_url} placeholder="https://..." onChange={(e) => {
                      setContentZone(prev => prev.map(b => b.id === block.id ? { ...b, link_url: e.target.value } : b))
                    }} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">コメント</Label>
                    <Textarea value={block.comment} rows={2} placeholder="画像の下に表示するテキスト" onChange={(e) => {
                      setContentZone(prev => prev.map(b => b.id === block.id ? { ...b, comment: e.target.value } : b))
                    }} />
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setContentZone(prev => [...prev, {
                  id: crypto.randomUUID(),
                  image_url: '',
                  link_url: '',
                  comment: '',
                }])}
              >
                <Plus className="mr-1 h-4 w-4" />
                コンテンツブロックを追加
              </Button>
            </CardContent>
          </Card>

          {/* CTA (共通) */}
          <Card>
            <CardHeader><CardTitle>CTA（行動喚起）</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>ボタンテキスト</Label>
                <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="お買い物はこちら" />
              </div>
              <div className="space-y-2">
                <Label>リンクURL</Label>
                <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://yo-ki-navi.com/..." />
              </div>
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={handleBackToStep1}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              基本情報に戻る
            </Button>
            <Button size="lg" onClick={handleExportHtml} disabled={isProcessing}>
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  HTML生成中...
                </>
              ) : (
                <>
                  <Code className="mr-2 h-4 w-4" />
                  この内容でHTML生成
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ===== Step 3: HTML生成・プレビュー ===== */}
      {currentStep === 3 && generatedHtml && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">生成結果</h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrentStep(2)}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                内容を修正して再生成
              </Button>
              <Button variant="outline" onClick={handleExportHtml} disabled={isProcessing}>
                {exportMutation.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-4 w-4" />
                )}
                再生成
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>HTMLソース</CardTitle>
                  <div className="flex gap-2">
                    {editableHtml !== generatedHtml && (
                      <Button size="sm" onClick={handleApplyHtmlEdit}>
                        <Code className="mr-1 h-4 w-4" />
                        プレビューに反映
                      </Button>
                    )}
                    <CopyButton text={editableHtml} label="HTMLをコピー" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <textarea
                  value={editableHtml}
                  onChange={(e) => setEditableHtml(e.target.value)}
                  className="w-full bg-muted p-4 rounded-lg max-h-[600px] min-h-[600px] text-xs font-mono whitespace-pre resize-y border-0 focus:outline-none focus:ring-1 focus:ring-primary"
                  spellCheck={false}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>プレビュー</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden bg-white">
                  <iframe
                    ref={previewIframeRef}
                    className="w-full min-h-[600px]"
                    title="特集ページプレビュー"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Bcart CMSへの手順</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ol className="list-decimal list-inside space-y-1">
                <li>上のHTMLソースを「HTMLをコピー」ボタンでコピー</li>
                <li>Bcart CMSの特集ページ編集画面を開く</li>
                <li>HTMLエディタモードに切り替え</li>
                <li>コピーしたHTMLを貼り付け</li>
                <li>プレビューで表示を確認して公開</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
