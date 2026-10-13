'use client'

import { useEffect, useState } from 'react'
import type { Me, MemberOption } from './types'
import { api } from './utils'

export function useMembers() {
  const [members, setMembers] = useState<MemberOption[]>([])
  useEffect(() => {
    api<{ members: MemberOption[] }>('/api/sfa/members', { silent: true })
      .then((d) => setMembers(d.members.filter((m) => (m as { active?: boolean }).active !== false)))
      .catch(() => setMembers([]))
  }, [])
  return members
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => {
    api<Me>('/api/sfa/me', { silent: true }).then(setMe).catch(() => setMe(null))
  }, [])
  return me
}
