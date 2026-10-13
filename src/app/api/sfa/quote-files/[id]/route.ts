import { NextResponse } from 'next/server'
import { errorResponse, idParam } from '@/lib/sfa/api'
import { requireMember } from '@/lib/sfa/member'
import { quoteFileUrl } from '@/lib/sfa/service'

type Ctx = { params: Promise<{ id: string }> }

/** 見積書を開く（10分有効の署名URLへリダイレクト） */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    await requireMember()
    const { url } = await quoteFileUrl(idParam((await params).id))
    return NextResponse.redirect(url)
  } catch (e) {
    return errorResponse(e)
  }
}
