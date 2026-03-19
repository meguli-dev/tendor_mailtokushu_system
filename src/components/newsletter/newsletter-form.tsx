'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, ArrowLeft, ArrowRight, Loader2, Sparkles, Code, GripVertical, Trash2, ImageIcon, Link, Type, PenLine } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { ProductInput, type ProductData } from './product-input'
import { useNewsletterTemplates } from '@/hooks/use-templates'
import { useCreateNewsletter, useUpdateNewsletter } from '@/hooks/use-newsletters'
import { CopyButton } from '@/components/shared/copy-button'
import { toast } from 'sonner'
import type { NewsletterWithProducts } from '@/types'

interface NewsletterFormProps {
  newsletter?: NewsletterWithProducts
}

interface ProposalSection {
  section_id: string
  section_name: string
  section_type: string
  description: string
  questions: Array<{
    question_id: string
    question: string
    input_type: 'text' | 'textarea' | 'select' | 'url' | 'product_assignment'
    options?: string[]
    default_value?: string
    required?: boolean
    placeholder?: string
  }>
}

interface Proposal {
  proposal_summary: string
  sections: ProposalSection[]
  product_assignment: {
    recommend_products: number[]
    ranking_products: number[]
    description: string
  }
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

type SectionType = 'ranking' | 'product_intro'

interface ContentZoneBlock {
  id: string
  image_url: string
  link_url: string
  text: string
}

const SECTION_TYPE_OPTIONS: { value: SectionType; label: string; description: string }[] = [
  { value: 'ranking', label: 'ランキング', description: '1位〜4位の順位付きで商品を紹介' },
  { value: 'product_intro', label: '商品紹介', description: '順位なしで商品を紹介' },
]

const MAX_PRODUCTS = 4

const DIRECTION_EXAMPLES = [
  '汁漏れ防止が強みのDLV麺丼を一番推したい',
  '夏のテイクアウト需要に合わせた訴求をしたい',
  'ランキングではなく用途別（ラーメン用、丼用）で紹介したい',
  '新商品のAP丼を目立たせたい',
  'コスパの良さをアピールしたい',
]

export function NewsletterForm({ newsletter }: NewsletterFormProps) {
  const router = useRouter()
  const { data: templates, isLoading: templatesLoading } = useNewsletterTemplates()
  const createMutation = useCreateNewsletter()
  const updateMutation = useUpdateNewsletter()

  const isEditing = !!newsletter
  const hasExistingHtml = !!(newsletter?.html_output)
  const draft = newsletter?.draft_data

  // Step management:
  //   HTML生成済み → Step 3
  //   draft_data あり（Step 2 で中断）→ Step 2
  //   それ以外 → Step 1
  const [currentStep, setCurrentStep] = useState(
    hasExistingHtml ? 3 : draft ? 2 : 1
  )

  // Step 1: Basic info
  const [title, setTitle] = useState(newsletter?.title || '')
  const [templateId, setTemplateId] = useState(newsletter?.template_id || '')
  const [directionMemo, setDirectionMemo] = useState(draft?.formFields?.directionMemo || '')
  const [products, setProducts] = useState<ProductData[]>(
    newsletter?.products?.length
      ? newsletter.products.map((p) => ({
          product_url: p.product_url,
          product_name: p.product_name,
          product_image_url: p.product_image_url,
          s3_image_url: p.s3_image_url,
          sort_order: p.sort_order,
          is_ranking: p.is_ranking,
          rank_position: p.rank_position,
        }))
      : [{ ...emptyProduct }]
  )
  const [contentZone, setContentZone] = useState<ContentZoneBlock[]>(
    draft?.contentZone || []
  )

  // Step 2: 構成設定（draft_data から復元）
  const [isProposing, setIsProposing] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(
    (draft?.proposal as Proposal) || null
  )
  const [answers, setAnswers] = useState<Record<string, string>>(
    draft?.answers || {}
  )
  const [productAssignment, setProductAssignment] = useState<{
    recommend: number[]
    ranking: number[]
  }>({
    recommend: draft?.proposal?.product_assignment?.recommend_products || [],
    ranking: draft?.proposal?.product_assignment?.ranking_products || [],
  })

  // Step 2 固定セクション（draft_data → DB → デフォルト の優先順で復元）
  const [useHeader, setUseHeader] = useState(
    draft?.formFields?.useHeader ?? newsletter?.has_header_image ?? true
  )
  const [headerImageUrl, setHeaderImageUrl] = useState(
    draft?.formFields?.headerImageUrl || newsletter?.header_image_url || ''
  )
  const [greeting, setGreeting] = useState(draft?.formFields?.greeting || '')
  const [recommendTitle, setRecommendTitle] = useState(draft?.formFields?.recommendTitle || '')
  const [recommendTags, setRecommendTags] = useState<string[]>(draft?.formFields?.recommendTags || [])
  const [useSubSection, setUseSubSection] = useState(() => {
    if (draft?.formFields?.useSubSection !== undefined) return draft.formFields.useSubSection
    if (!newsletter?.products) return false
    return newsletter.products.some(p => p.is_ranking)
  })
  const [sectionType, setSectionType] = useState<SectionType>(
    (draft?.formFields?.sectionType as SectionType) || 'ranking'
  )
  const [subSectionProducts, setSubSectionProducts] = useState<ProductData[]>(() => {
    if (!newsletter?.products) return []
    return newsletter.products
      .filter(p => p.is_ranking)
      .sort((a, b) => (a.rank_position || 0) - (b.rank_position || 0))
      .map(p => ({
        product_url: p.product_url,
        product_name: p.product_name,
        product_image_url: p.product_image_url,
        s3_image_url: p.s3_image_url,
        sort_order: p.sort_order,
        is_ranking: p.is_ranking,
        rank_position: p.rank_position,
      }))
  })
  const [subSectionTitle, setSubSectionTitle] = useState(draft?.formFields?.subSectionTitle || '')
  const [subSectionTags, setSubSectionTags] = useState<string[]>(draft?.formFields?.subSectionTags || [])
  const [ctaButtonText, setCtaButtonText] = useState(draft?.formFields?.ctaButtonText || '')
  const [ctaButtonUrl, setCtaButtonUrl] = useState(draft?.formFields?.ctaButtonUrl || '')
  const [featureTitle, setFeatureTitle] = useState(
    draft?.formFields?.featureTitle || newsletter?.feature_title || ''
  )
  const [featureDescription, setFeatureDescription] = useState(
    draft?.formFields?.featureDescription || newsletter?.feature_description || ''
  )

  // Step 3: Generated HTML（既存HTMLを復元）
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedHtml, setGeneratedHtml] = useState(newsletter?.html_output || '')
  const [newsletterId, setNewsletterId] = useState(newsletter?.id || '')
  const selectedTemplate = templates?.find((t) => t.id === templateId)

  function updateProduct(index: number, data: Partial<ProductData>) {
    setProducts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...data } : p))
    )
  }

  function removeProduct(index: number) {
    setProducts((prev) => prev.filter((_, i) => i !== index))
  }

  function addProduct() {
    setProducts((prev) => [...prev, { ...emptyProduct, sort_order: prev.length }])
  }

  function updateSubSectionProduct(index: number, data: Partial<ProductData>) {
    setSubSectionProducts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...data } : p))
    )
  }

  function removeSubSectionProduct(index: number) {
    setSubSectionProducts((prev) => prev.filter((_, i) => i !== index))
  }

  function addSubSectionProduct() {
    const max = sectionType === 'ranking' ? 4 : 2
    if (subSectionProducts.length >= max) return
    setSubSectionProducts((prev) => [...prev, { ...emptyProduct, sort_order: prev.length }])
  }

  function handleToggleSubSection(enabled: boolean) {
    setUseSubSection(enabled)
    if (enabled && subSectionProducts.length === 0) {
      const count = sectionType === 'ranking' ? 4 : 2
      setSubSectionProducts(
        Array.from({ length: count }, (_, i) => ({ ...emptyProduct, sort_order: i }))
      )
    }
  }

  function handleSectionTypeChange(type: SectionType) {
    setSectionType(type)
    const count = type === 'ranking' ? 4 : 2
    setSubSectionProducts(
      Array.from({ length: count }, (_, i) => ({ ...emptyProduct, sort_order: i }))
    )
  }

  function addContentZoneBlock() {
    setContentZone((prev) => [
      ...prev,
      { id: crypto.randomUUID(), image_url: '', link_url: '', text: '' },
    ])
  }

  function updateContentZoneBlock(id: string, data: Partial<ContentZoneBlock>) {
    setContentZone((prev) =>
      prev.map((block) => (block.id === id ? { ...block, ...data } : block))
    )
  }

  function removeContentZoneBlock(id: string) {
    setContentZone((prev) => prev.filter((block) => block.id !== id))
  }

  // section_type → フォームフィールドへのマッピング
  // header_imageはアドバイスのみ（URLは提案しない）なのでフォームに反映しない
  function applyAnswerToForm(sectionType: string, questionId: string, value: string) {
    switch (sectionType) {
      case 'greeting':
        setGreeting(value)
        break
      case 'header_image':
        // AIはアドバイスのみ。URL反映はしない
        break
      case 'recommend_title':
        setRecommendTitle(value)
        break
      case 'product_list':
        if (questionId.includes('title') || questionId.includes('recommend')) {
          setRecommendTitle(value)
        }
        break
      case 'cta':
        if (questionId.includes('text') || questionId.includes('label') || questionId.includes('button')) {
          setCtaButtonText(value)
        } else if (questionId.includes('url') || questionId.includes('link')) {
          setCtaButtonUrl(value)
        }
        break
      case 'feature_title':
      case 'feature':
        if (questionId.includes('description') || questionId.includes('desc')) {
          setFeatureDescription(value)
        } else {
          setFeatureTitle(value)
        }
        break
      case 'ranking':
        if (questionId.includes('title')) {
          setSubSectionTitle(value)
          setUseSubSection(true)
          setSectionType('ranking')
        }
        break
    }
  }

  function applyProposalToForm(data: Proposal, defaultAnswers: Record<string, string>) {
    data.sections.forEach(section => {
      section.questions.forEach(q => {
        const val = defaultAnswers[q.question_id]
        if (val) {
          applyAnswerToForm(section.section_type, q.question_id, val)
        }
      })
    })
  }

  // draft_data をDBに保存（明示的にフォーム値を渡す）
  async function saveDraft(
    id: string,
    proposalData: Proposal | null,
    answersData: Record<string, string>,
    formFieldsOverride?: Record<string, unknown>,
  ) {
    const draftData = {
      proposal: proposalData,
      answers: answersData,
      formFields: {
        useHeader,
        headerImageUrl,
        greeting,
        recommendTitle,
        recommendTags,
        useSubSection,
        sectionType,
        subSectionTitle,
        subSectionTags,
        ctaButtonText,
        ctaButtonUrl,
        featureTitle,
        featureDescription,
        directionMemo,
        ...formFieldsOverride,
      },
      contentZone,
    }

    const res = await fetch(`/api/newsletter/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_data: draftData }),
    })
    if (!res.ok) {
      console.error('draft_data save failed:', await res.text())
    }
  }

  // Step 2 の自動保存: フォーム変更時にデバウンスで保存 + ページ離脱時にも保存
  const saveDraftRef = useRef(saveDraft)
  saveDraftRef.current = saveDraft
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // デバウンス自動保存（Step 2 でフォーム変更から5秒後に保存）
  useEffect(() => {
    if (currentStep !== 2 || !newsletterId || !proposal) return

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      saveDraftRef.current(newsletterId, proposal, answers)
    }, 5000)

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [currentStep, newsletterId, proposal, answers, useHeader, headerImageUrl, greeting,
      recommendTitle, recommendTags, useSubSection, sectionType, subSectionTitle,
      subSectionTags, ctaButtonText, ctaButtonUrl, featureTitle, featureDescription,
      directionMemo, contentZone])

  // Step 2 離脱時の保存関数
  const saveDraftBeforeLeave = useCallback(async () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    if (newsletterId && proposal) {
      await saveDraftRef.current(newsletterId, proposal, answers)
    }
  }, [newsletterId, proposal, answers])

  // Step 1 → Step 2: AI提案を取得
  async function handleGetProposal() {
    if (!title) {
      toast.error('テーマを入力してください')
      return
    }
    if (!templateId || !selectedTemplate) {
      toast.error('テンプレートを選択してください')
      return
    }

    const validProducts = products.filter(p => p.product_url)
    if (validProducts.length === 0) {
      toast.error('少なくとも1つの商品を登録してください')
      return
    }

    setIsProposing(true)
    try {
      const res = await fetch('/api/newsletter/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_html: selectedTemplate.html_template,
          template_name: selectedTemplate.name,
          theme: title,
          direction_memo: directionMemo,
          products: validProducts.map(p => ({
            product_name: p.product_name,
            product_url: p.product_url,
          })),
          content_zone: contentZone.filter(c => c.image_url || c.link_url || c.text),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'AI提案の取得に失敗しました')
      }

      const data: Proposal = await res.json()
      setProposal(data)

      // デフォルト値で回答を初期化
      const defaultAnswers: Record<string, string> = {}
      data.sections.forEach(section => {
        section.questions.forEach(q => {
          if (q.default_value) {
            defaultAnswers[q.question_id] = q.default_value
          }
        })
      })
      setAnswers(defaultAnswers)

      // AI提案からフォームフィールドの値を計算（setterも呼ぶ）
      const appliedFields: Record<string, unknown> = { directionMemo }
      data.sections.forEach(section => {
        section.questions.forEach(q => {
          const val = defaultAnswers[q.question_id]
          if (!val) return
          applyAnswerToForm(section.section_type, q.question_id, val)
          // saveDraft用に値を記録（setterは次レンダーまで反映されないため）
          switch (section.section_type) {
            case 'greeting': appliedFields.greeting = val; break
            case 'recommend_title': appliedFields.recommendTitle = val; break
            case 'product_list':
              if (q.question_id.includes('title') || q.question_id.includes('recommend'))
                appliedFields.recommendTitle = val
              break
            case 'cta':
              if (q.question_id.includes('text') || q.question_id.includes('label') || q.question_id.includes('button'))
                appliedFields.ctaButtonText = val
              else if (q.question_id.includes('url') || q.question_id.includes('link'))
                appliedFields.ctaButtonUrl = val
              break
            case 'feature_title': case 'feature':
              if (q.question_id.includes('description') || q.question_id.includes('desc'))
                appliedFields.featureDescription = val
              else appliedFields.featureTitle = val
              break
            case 'ranking':
              if (q.question_id.includes('title')) {
                appliedFields.subSectionTitle = val
                appliedFields.useSubSection = true
              }
              break
          }
        })
      })

      // 商品配置を初期化
      if (data.product_assignment) {
        setProductAssignment({
          recommend: data.product_assignment.recommend_products || [],
          ranking: data.product_assignment.ranking_products || [],
        })
      }

      // メルマガをDBに保存（まだ保存されていない場合は作成）
      let id = newsletterId
      const validProductsForSave = products.filter(p => p.product_url)

      if (!id) {
        const created = await createMutation.mutateAsync({
          title,
          template_id: templateId || null,
          has_header_image: false,
          status: 'draft' as const,
        })
        id = created.id
        setNewsletterId(id)

        // 商品保存
        if (validProductsForSave.length > 0) {
          await fetch(`/api/newsletter/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              products: validProductsForSave.map((p, i) => ({
                ...p,
                sort_order: i,
              })),
            }),
          })
        }
      }

      // draft_data を保存（appliedFieldsで最新値を上書き）
      await saveDraft(id, data, defaultAnswers, appliedFields)

      setCurrentStep(2)
      toast.success('AIがメルマガの構成を提案しました')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI提案の取得に失敗しました')
    } finally {
      setIsProposing(false)
    }
  }

  // Step 2 → Step 3: HTML生成
  async function handleGenerate() {
    setIsGenerating(true)
    try {
      let id = newsletterId
      const validProducts = products.filter(p => p.product_url)

      if (!id) {
        // まだDB未保存の場合（通常はhandleGetProposalで保存済み）
        const created = await createMutation.mutateAsync({
          title,
          template_id: templateId || null,
          has_header_image: useHeader && !!headerImageUrl,
          header_image_url: useHeader ? headerImageUrl || null : null,
          feature_title: featureTitle || null,
          feature_description: featureDescription || null,
          status: 'draft' as const,
        })
        id = created.id
        setNewsletterId(id)
      }

      // フォーム値とdraft_dataをDBに更新
      await fetch(`/api/newsletter/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          has_header_image: useHeader && !!headerImageUrl,
          header_image_url: useHeader ? headerImageUrl || null : null,
          feature_title: featureTitle || null,
          feature_description: featureDescription || null,
        }),
      })
      await saveDraft(id, proposal, answers)

      // 商品保存
      if (validProducts.length > 0) {
        await fetch(`/api/newsletter/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            products: validProducts.map((p, i) => ({
              ...p,
              is_ranking: productAssignment.ranking.includes(i),
              rank_position: productAssignment.ranking.includes(i)
                ? productAssignment.ranking.indexOf(i) + 1
                : null,
              sort_order: i,
            })),
          }),
        })
      }

      // HTML生成
      const res = await fetch(`/api/newsletter/${id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          direction_memo: directionMemo,
          header: useHeader ? { image_url: headerImageUrl } : null,
          greeting,
          recommend: {
            title: recommendTitle,
            tags: recommendTags,
          },
          sub_section: useSubSection ? {
            type: sectionType,
            title: subSectionTitle,
            products: subSectionProducts.filter(p => p.product_url),
            tags: subSectionTags,
          } : null,
          cta: { text: ctaButtonText, url: ctaButtonUrl },
          feature: { title: featureTitle, description: featureDescription },
          content_zone: contentZone.filter(c => c.image_url || c.link_url || c.text),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'HTML生成に失敗しました')
      }

      const result = await res.json()
      setGeneratedHtml(result.html)
      setCurrentStep(3)
      toast.success('メルマガHTMLを生成しました')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'HTML生成に失敗しました')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={async () => {
          if (currentStep === 3) {
            setCurrentStep(2)
          } else if (currentStep === 2) {
            await saveDraftBeforeLeave()
            if (!isEditing) {
              setCurrentStep(1)
            } else {
              router.back()
            }
          } else {
            router.back()
          }
        }}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {currentStep === 3 ? '構成設定に戻る'
            : currentStep === 2 && !isEditing ? '基本情報に戻る'
            : 'ダッシュボードへ'}
        </Button>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {[
          { num: 1, label: '基本情報・商品登録' },
          { num: 2, label: '構成設定' },
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

      {/* ===== Step 1: 基本情報・商品登録 ===== */}
      {currentStep === 1 && (
        <div className="space-y-6">
          {/* テーマ */}
          <Card>
            <CardHeader>
              <CardTitle>特集テーマ</CardTitle>
              <CardDescription>メルマガの特集テーマを入力してください</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: 丼ぶり特集、春のテイクアウト容器特集"
                className="text-lg"
              />
            </CardContent>
          </Card>

          {/* テンプレート選択 */}
          <Card>
            <CardHeader>
              <CardTitle>テンプレート選択</CardTitle>
              <CardDescription>メルマガのレイアウトを選択してください</CardDescription>
            </CardHeader>
            <CardContent>
              {templatesLoading ? (
                <div className="flex gap-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-32" />)}
                </div>
              ) : (
                <div className="flex gap-4 flex-wrap">
                  {templates?.filter((t) => t.is_active).map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => setTemplateId(tmpl.id)}
                      className={`rounded-lg border-2 p-3 text-left transition-colors ${
                        templateId === tmpl.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                      style={{ width: 180 }}
                    >
                      {tmpl.thumbnail_url ? (
                        <img src={tmpl.thumbnail_url} alt={tmpl.name} className="h-24 w-full object-cover rounded mb-2" />
                      ) : (
                        <div className="h-24 bg-muted rounded mb-2 flex items-center justify-center text-xs text-muted-foreground">
                          {tmpl.name}
                        </div>
                      )}
                      <p className="text-sm font-medium">{tmpl.name}</p>
                      <p className="text-xs text-muted-foreground">
                        商品数: {tmpl.product_count} {tmpl.has_ranking && '/ ランキングあり'}
                      </p>
                      {tmpl.description && (
                        <p className="text-xs text-muted-foreground mt-1">{tmpl.description}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* おすすめ商品登録 */}
          <Card>
            <CardHeader>
              <CardTitle>おすすめ商品</CardTitle>
              <CardDescription>
                メルマガに掲載したい商品のURLを入力して「取得」ボタンで情報を取得してください
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {products.map((product, index) => (
                <ProductInput
                  key={index}
                  product={product}
                  index={index}
                  onUpdate={updateProduct}
                  onRemove={products.length > 1 ? removeProduct : undefined}
                />
              ))}
              <Button type="button" variant="outline" onClick={addProduct} className="w-full">
                <Plus className="mr-1 h-4 w-4" />
                商品を追加
              </Button>
            </CardContent>
          </Card>

          {/* コンテンツゾーン */}
          <Card>
            <CardHeader>
              <CardTitle>コンテンツゾーン</CardTitle>
              <CardDescription>
                メルマガ下部に表示するコンテンツを追加できます（画像・リンク・テキスト）
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {contentZone.map((block, index) => (
                <div key={block.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">コンテンツ {index + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeContentZoneBlock(block.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1">
                      <ImageIcon className="h-3 w-3 text-blue-500" />
                      画像URL
                    </Label>
                    <Input
                      value={block.image_url}
                      onChange={(e) => updateContentZoneBlock(block.id, { image_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1">
                      <Link className="h-3 w-3 text-green-500" />
                      リンクURL
                    </Label>
                    <Input
                      value={block.link_url}
                      onChange={(e) => updateContentZoneBlock(block.id, { link_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1">
                      <Type className="h-3 w-3 text-orange-500" />
                      テキスト
                    </Label>
                    <Textarea
                      value={block.text}
                      onChange={(e) => updateContentZoneBlock(block.id, { text: e.target.value })}
                      placeholder="テキスト内容を入力"
                      rows={2}
                    />
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addContentZoneBlock} className="w-full">
                <Plus className="mr-1 h-4 w-4" />
                コンテンツを追加
              </Button>
            </CardContent>
          </Card>

          {/* 方向性メモ */}
          <Card>
            <CardHeader>
              <CardTitle>方向性メモ</CardTitle>
              <CardDescription>
                メルマガの方向性やこだわりがあれば書いてください。AIがこの内容を元に構成を提案します。空欄でもOKです。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={directionMemo}
                onChange={(e) => setDirectionMemo(e.target.value)}
                placeholder="例: DLV麺丼を一番推したい、汁漏れ防止がウリ"
                rows={3}
              />
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-2">入力例（クリックで挿入）:</p>
                <div className="flex flex-wrap gap-1">
                  {DIRECTION_EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      className="rounded bg-muted px-2 py-1 text-xs hover:bg-muted/80 cursor-pointer"
                      onClick={() => {
                        setDirectionMemo(prev =>
                          prev ? `${prev}\n${example}` : example
                        )
                      }}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Next Step */}
          <div className="flex justify-end">
            <Button
              onClick={handleGetProposal}
              disabled={isProposing || !title || !templateId}
              size="lg"
            >
              {isProposing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  AIが構成を考え中...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  AIに構成を提案してもらう
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ===== Step 2: 構成設定 ===== */}
      {currentStep === 2 && (
        <div className="space-y-6">
          {/* AI提案がない場合: 再取得ボタン */}
          {!proposal && (
            <Card className="border-dashed">
              <CardContent className="flex items-center justify-between py-4">
                <p className="text-sm text-muted-foreground">
                  AI提案データがありません。再取得するとAIの提案内容が表示されます。
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGetProposal}
                  disabled={isProposing || !templateId}
                >
                  {isProposing ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-4 w-4" />
                  )}
                  AI提案を取得
                </Button>
              </CardContent>
            </Card>
          )}

          {/* AI提案サマリー */}
          {proposal && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  AIの構成提案
                </CardTitle>
                <CardDescription>
                  AIが提案した内容です。選択・編集して「反映」すると下のフォームに反映されます。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">{proposal.proposal_summary}</p>

                {/* AIセクション別の提案表示 */}
                {proposal.sections.length > 0 && (
                  <div className="space-y-4 pt-2 border-t border-primary/20">
                    {proposal.sections.map((section) => (
                      <div key={section.section_id} className="space-y-3 rounded-lg border border-primary/10 bg-background p-3">
                        <div>
                          <h4 className="text-sm font-semibold">{section.section_name}</h4>
                          {section.description && (
                            <p className="text-xs text-muted-foreground">{section.description}</p>
                          )}
                        </div>
                        {section.questions.map((q) => (
                          <div key={q.question_id} className="space-y-1.5">
                            <Label className="text-xs">
                              {q.question}
                              {q.required && <span className="text-destructive ml-1">*</span>}
                            </Label>

                            {/* header_image: アドバイス表示のみ（URL反映なし） */}
                            {section.section_type === 'header_image' ? (
                              <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                  {answers[q.question_id] || q.default_value || ''}
                                </p>
                                <p className="text-xs text-muted-foreground mt-2">
                                  ※ 画像のURLは下の「① ヘッダー画像」で設定してください
                                </p>
                              </div>

                            /* select型: クリックで選択＆即反映 */
                            ) : q.input_type === 'select' && q.options ? (
                              <div className="space-y-1.5">
                                {q.options.map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => {
                                      setAnswers((prev) => ({ ...prev, [q.question_id]: opt }))
                                      applyAnswerToForm(section.section_type, q.question_id, opt)
                                      toast.success('フォームに反映しました')
                                    }}
                                    className={`w-full rounded-lg border-2 p-3 text-left text-sm transition-colors ${
                                      answers[q.question_id] === opt
                                        ? 'border-primary bg-primary/5 font-medium'
                                        : 'border-border hover:border-primary/50'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            ) : q.input_type === 'textarea' ? (
                              /* textarea型 */
                              <div className="space-y-1.5">
                                <Textarea
                                  value={answers[q.question_id] || ''}
                                  onChange={(e) =>
                                    setAnswers((prev) => ({ ...prev, [q.question_id]: e.target.value }))
                                  }
                                  placeholder={q.placeholder || ''}
                                  rows={3}
                                  className="bg-background"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const val = answers[q.question_id]
                                    if (val) {
                                      applyAnswerToForm(section.section_type, q.question_id, val)
                                      toast.success('フォームに反映しました')
                                    }
                                  }}
                                  className="text-xs"
                                >
                                  <ArrowRight className="mr-1 h-3 w-3" />
                                  下のフォームに反映
                                </Button>
                              </div>
                            ) : (
                              /* text / url型 */
                              <div className="flex gap-2">
                                <Input
                                  type={q.input_type === 'url' ? 'url' : 'text'}
                                  value={answers[q.question_id] || ''}
                                  onChange={(e) =>
                                    setAnswers((prev) => ({ ...prev, [q.question_id]: e.target.value }))
                                  }
                                  placeholder={q.placeholder || ''}
                                  className="bg-background"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const val = answers[q.question_id]
                                    if (val) {
                                      applyAnswerToForm(section.section_type, q.question_id, val)
                                      toast.success('フォームに反映しました')
                                    }
                                  }}
                                  className="shrink-0 text-xs"
                                >
                                  <ArrowRight className="mr-1 h-3 w-3" />
                                  反映
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* 商品配置の提案 */}
                {proposal.product_assignment?.description && (
                  <div className="pt-2 border-t border-primary/20">
                    <h4 className="text-sm font-semibold mb-1">商品配置の提案</h4>
                    <p className="text-xs text-muted-foreground">{proposal.product_assignment.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 手動入力エリア見出し */}
          <div className="flex items-center gap-3 pt-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <PenLine className="h-5 w-5" />
              <h3 className="text-base font-semibold text-foreground">各セクションの設定</h3>
            </div>
            <Separator className="flex-1" />
          </div>
          <p className="text-xs text-muted-foreground -mt-4">
            AIの提案が上のフォームから自動反映されています。必要に応じて修正してください。
          </p>

          {/* ① ヘッダー有無 */}
          <Card>
            <CardHeader>
              <CardTitle>① ヘッダー画像</CardTitle>
              <CardDescription>メルマガ上部のヘッダー画像を使用しますか？</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setUseHeader(true)}
                  className={`flex-1 rounded-lg border-2 p-3 text-center text-sm font-medium transition-colors ${
                    useHeader ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                  }`}
                >
                  使用する
                </button>
                <button
                  type="button"
                  onClick={() => setUseHeader(false)}
                  className={`flex-1 rounded-lg border-2 p-3 text-center text-sm font-medium transition-colors ${
                    !useHeader ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                  }`}
                >
                  使用しない
                </button>
              </div>
              {useHeader && (
                <div className="space-y-2">
                  <Label className="text-xs">ヘッダー画像URL</Label>
                  <Input
                    value={headerImageUrl}
                    onChange={(e) => setHeaderImageUrl(e.target.value)}
                    placeholder="https://... （画像URL）"
                  />
                  {headerImageUrl && (
                    <img src={headerImageUrl} alt="ヘッダープレビュー" className="max-h-32 rounded border" />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ② グリーティング文章 */}
          <Card>
            <CardHeader>
              <CardTitle>② グリーティング</CardTitle>
              <CardDescription>メルマガ冒頭の挨拶文を入力してください</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                placeholder={answers['greeting'] || 'いつも容器ナビをご利用いただきありがとうございます。'}
                rows={3}
              />
            </CardContent>
          </Card>

          {/* ③ おすすめタイトル */}
          <Card>
            <CardHeader>
              <CardTitle>③ おすすめタイトル</CardTitle>
              <CardDescription>おすすめゾーンの見出しを入力してください</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                value={recommendTitle}
                onChange={(e) => setRecommendTitle(e.target.value)}
                placeholder={answers['recommend_title'] || '今月のおすすめ商品'}
              />
            </CardContent>
          </Card>

          {/* ④ おすすめ商品タグ */}
          <Card>
            <CardHeader>
              <CardTitle>④ おすすめ商品のタグ</CardTitle>
              <CardDescription>
                Step 1で登録した各おすすめ商品のタグ（バッジ）を設定してください
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {products.filter(p => p.product_url).map((product, index) => (
                <div key={index} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                  {product.s3_image_url || product.product_image_url ? (
                    <img
                      src={product.s3_image_url || product.product_image_url || ''}
                      alt=""
                      className="h-10 w-10 object-cover rounded"
                    />
                  ) : (
                    <div className="h-10 w-10 bg-muted rounded flex items-center justify-center text-xs">{index + 1}</div>
                  )}
                  <span className="text-sm flex-shrink-0 min-w-0 truncate flex-1">
                    {product.product_name || product.product_url}
                  </span>
                  <Input
                    value={recommendTags[index] || ''}
                    onChange={(e) => {
                      setRecommendTags(prev => {
                        const next = [...prev]
                        next[index] = e.target.value
                        return next
                      })
                    }}
                    placeholder="タグ（例: おすすめ, NEW）"
                    className="w-40"
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ⑤ ランキング / 商品紹介 */}
          <Card>
            <CardHeader>
              <CardTitle>⑤ ランキング / 商品紹介</CardTitle>
              <CardDescription>ランキングもしくは商品紹介を利用しますか？</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleToggleSubSection(true)}
                  className={`flex-1 rounded-lg border-2 p-3 text-center text-sm font-medium transition-colors ${
                    useSubSection ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                  }`}
                >
                  使用する
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleSubSection(false)}
                  className={`flex-1 rounded-lg border-2 p-3 text-center text-sm font-medium transition-colors ${
                    !useSubSection ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                  }`}
                >
                  使用しない
                </button>
              </div>

              {useSubSection && (
                <div className="space-y-4 rounded-lg border border-dashed p-4">
                  {/* タイプ選択 */}
                  <div className="flex gap-3">
                    {SECTION_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleSectionTypeChange(opt.value)}
                        className={`flex-1 rounded-lg border-2 p-4 text-left transition-colors ${
                          sectionType === opt.value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <p className="font-semibold text-sm">{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
                      </button>
                    ))}
                  </div>

                  {/* タイトル */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">
                      {sectionType === 'ranking' ? 'ランキングタイトル' : '商品紹介タイトル'}
                    </Label>
                    <Input
                      value={subSectionTitle}
                      onChange={(e) => setSubSectionTitle(e.target.value)}
                      placeholder={sectionType === 'ranking' ? '人気ランキング' : '注目の商品'}
                    />
                  </div>

                  {/* 商品URL入力 */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">
                      {sectionType === 'ranking' ? 'ランキング商品（最大4商品）' : '紹介商品（最大2商品）'}
                    </Label>
                    {subSectionProducts.map((product, index) => (
                      <ProductInput
                        key={index}
                        product={product}
                        index={index}
                        onUpdate={updateSubSectionProduct}
                        onRemove={subSectionProducts.length > 1 ? removeSubSectionProduct : undefined}
                        isRanking={sectionType === 'ranking'}
                      />
                    ))}
                    {subSectionProducts.length < (sectionType === 'ranking' ? 4 : 2) && (
                      <Button type="button" variant="outline" onClick={addSubSectionProduct} className="w-full">
                        <Plus className="mr-1 h-4 w-4" />
                        {sectionType === 'ranking'
                          ? `${subSectionProducts.length + 1}位を追加`
                          : '商品を追加'}
                      </Button>
                    )}
                  </div>

                  {/* タグ変更 */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">タグ設定</Label>
                    {subSectionProducts.filter(p => p.product_url).map((product, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                        {product.s3_image_url || product.product_image_url ? (
                          <img
                            src={product.s3_image_url || product.product_image_url || ''}
                            alt=""
                            className="h-10 w-10 object-cover rounded"
                          />
                        ) : (
                          <div className="h-10 w-10 bg-muted rounded flex items-center justify-center text-xs">
                            {sectionType === 'ranking' ? `${index + 1}位` : index + 1}
                          </div>
                        )}
                        <span className="text-sm flex-shrink-0 min-w-0 truncate flex-1">
                          {product.product_name || product.product_url}
                        </span>
                        <Input
                          value={subSectionTags[index] || ''}
                          onChange={(e) => {
                            setSubSectionTags(prev => {
                              const next = [...prev]
                              next[index] = e.target.value
                              return next
                            })
                          }}
                          placeholder={sectionType === 'ranking' ? `${index + 1}位` : 'タグ'}
                          className="w-40"
                        />
                      </div>
                    ))}
                    {subSectionProducts.filter(p => p.product_url).length === 0 && (
                      <p className="text-xs text-muted-foreground">商品を登録するとタグ設定が表示されます</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ⑥ CTAボタン */}
          <Card>
            <CardHeader>
              <CardTitle>⑥ CTAボタン</CardTitle>
              <CardDescription>メルマガ内のアクションボタンを設定してください</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">ボタンテキスト</Label>
                <Input
                  value={ctaButtonText}
                  onChange={(e) => setCtaButtonText(e.target.value)}
                  placeholder="例: 商品一覧を見る"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">リンクURL</Label>
                <Input
                  value={ctaButtonUrl}
                  onChange={(e) => setCtaButtonUrl(e.target.value)}
                  placeholder="https://yo-ki-navi.com/..."
                />
              </div>
            </CardContent>
          </Card>

          {/* ⑦ 特集 */}
          <Card>
            <CardHeader>
              <CardTitle>⑦ 特集</CardTitle>
              <CardDescription>特集セクションの内容を設定してください</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">特集タイトル</Label>
                <Input
                  value={featureTitle}
                  onChange={(e) => setFeatureTitle(e.target.value)}
                  placeholder="例: 今月の特集"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">特集の説明</Label>
                <Textarea
                  value={featureDescription}
                  onChange={(e) => setFeatureDescription(e.target.value)}
                  placeholder="特集の内容を入力"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Generate Button */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={async () => {
              await saveDraftBeforeLeave()
              setCurrentStep(1)
            }}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              修正する
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              size="lg"
            >
              {isGenerating ? (
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
              <Button variant="outline" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? (
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
                  <CopyButton text={generatedHtml} label="HTMLをコピー" />
                </div>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[600px] text-xs font-mono whitespace-pre-wrap">
                  {generatedHtml}
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
                    srcDoc={generatedHtml}
                    className="w-full min-h-[600px]"
                    sandbox="allow-same-origin"
                    title="メールプレビュー"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

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
        </div>
      )}
    </div>
  )
}
