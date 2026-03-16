'use client'

import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createContext, useContext, useState, type ReactNode } from 'react'

type SupabaseContext = {
  supabase: SupabaseClient
}

const Context = createContext<SupabaseContext | undefined>(undefined)

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createClient())

  return (
    <Context.Provider value={{ supabase }}>
      {children}
    </Context.Provider>
  )
}

export function useSupabase() {
  const context = useContext(Context)
  if (!context) {
    throw new Error('useSupabase must be used within a SupabaseProvider')
  }
  return context.supabase
}
