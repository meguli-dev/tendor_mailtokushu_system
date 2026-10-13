/**
 * SFAメンバー（ロール）の解決
 *
 * - SFAにアクセスできるのは sfa_members に登録されたユーザーだけ（SCOS共通DBのため他アプリのユーザーは入れない）
 * - role=sales（外部営業）はポータルのSFA以外を使えない。middlewareで止めるため、
 *   Supabaseユーザーの app_metadata.portal_role にも 'sales' を書き込む（毎リクエストのDB照会を避ける）
 */
import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export interface SfaMember {
  id: number
  name: string
  tenant_id: string
  role: 'admin' | 'sales'
  email: string | null
  auth_user_id: string | null
  chatwork_account_id: string | null
  chatwork_room_id: string | null
  active: boolean
}

const MEMBER_COLUMNS = 'id, name, tenant_id, role, email, auth_user_id, chatwork_account_id, chatwork_room_id, active'

export class SfaAuthError extends Error {
  status: number
  constructor(message: string, status = 403) {
    super(message)
    this.status = status
  }
}

/** ログイン中ユーザーのメンバー。auth_user_id 未紐付けならメールで探して紐付ける */
export async function getCurrentMember(): Promise<SfaMember | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: byId } = await admin.from('sfa_members').select(MEMBER_COLUMNS)
    .eq('auth_user_id', user.id).eq('active', true).maybeSingle()
  if (byId) return byId as SfaMember

  if (!user.email) return null
  const { data: byEmail } = await admin.from('sfa_members').select(MEMBER_COLUMNS)
    .ilike('email', user.email).is('auth_user_id', null).eq('active', true).maybeSingle()
  if (!byEmail) return null
  await admin.from('sfa_members').update({ auth_user_id: user.id }).eq('id', byEmail.id)
  await syncPortalRole(user.id, (byEmail as SfaMember).role)
  return { ...(byEmail as SfaMember), auth_user_id: user.id }
}

export async function requireMember(): Promise<SfaMember> {
  const m = await getCurrentMember()
  if (!m) throw new SfaAuthError('SFAのメンバーとして登録されていません。管理者に登録を依頼してください。')
  return m
}

export function requireAdmin(m: SfaMember) {
  if (m.role !== 'admin') throw new SfaAuthError('この操作は管理者のみ可能です')
}

// =============================================================
// MCP用の個人キー
// =============================================================
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/** 新しい個人キーを発行して保存し、平文を返す（平文はこの1回しか見せない） */
export async function issueMcpKey(memberId: number): Promise<string> {
  const key = `sfa_${randomBytes(24).toString('base64url')}`
  const admin = createAdminClient()
  const { error } = await admin.from('sfa_members').update({ mcp_key_hash: hashKey(key) }).eq('id', memberId)
  if (error) throw new Error(error.message)
  return key
}

/**
 * Bearerキー → メンバー
 *   個人キー（sfa_...）: そのメンバー
 *   YOUKINAVI_MCP_KEY  : 管理用。SFA_MCP_DEFAULT_MEMBER（既定 meguli）として扱う
 */
export async function memberFromBearer(header: string | null): Promise<SfaMember | null> {
  const key = (header || '').replace(/^Bearer\s+/i, '').trim()
  if (!key) return null
  const admin = createAdminClient()
  if (process.env.YOUKINAVI_MCP_KEY && key === process.env.YOUKINAVI_MCP_KEY) {
    const { data } = await admin.from('sfa_members').select(MEMBER_COLUMNS)
      .eq('name', process.env.SFA_MCP_DEFAULT_MEMBER || 'meguli').eq('active', true).maybeSingle()
    return (data as SfaMember) ?? null
  }
  const { data } = await admin.from('sfa_members').select(MEMBER_COLUMNS)
    .eq('mcp_key_hash', hashKey(key)).eq('active', true).maybeSingle()
  return (data as SfaMember) ?? null
}

// =============================================================
// ポータル内ロール（middleware用）
// =============================================================
export async function syncPortalRole(authUserId: string, role: 'admin' | 'sales') {
  const admin = createAdminClient()
  const { data } = await admin.auth.admin.getUserById(authUserId)
  const current = data.user?.app_metadata?.portal_role
  const next = role === 'sales' ? 'sales' : null
  if ((current ?? null) === next) return
  await admin.auth.admin.updateUserById(authUserId, {
    app_metadata: { ...(data.user?.app_metadata || {}), portal_role: next },
  })
}
