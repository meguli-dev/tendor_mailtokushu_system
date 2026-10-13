import { parseBody, withMember } from '@/lib/sfa/api'
import { syncPortalRole } from '@/lib/sfa/member'
import { memberSchema } from '@/lib/sfa/schemas'
import { listMembers, listTenants, upsertMember } from '@/lib/sfa/service'

/** メンバー一覧（担当者の選択肢にも使うので全メンバーが参照可） */
export async function GET() {
  return withMember(async (m) => {
    const members = await listMembers()
    if (m.role !== 'admin') return { members: members.filter((x) => x.active).map(({ id, name, tenant_name }) => ({ id, name, tenant_name })) }
    return { members, tenants: await listTenants() }
  })
}

/** メンバーの登録・更新（管理者のみ） */
export async function POST(request: Request) {
  return withMember(async () => {
    const saved = await upsertMember(await parseBody(request, memberSchema))
    if (saved.auth_user_id) await syncPortalRole(saved.auth_user_id, saved.role)
    return saved
  }, { admin: true })
}
