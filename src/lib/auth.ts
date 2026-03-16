import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { User, AuthResult } from '@/types'

// Auth service interface - can be swapped to NextAuth.js v5 later
export interface AuthService {
  signIn(email: string, password: string): Promise<AuthResult>
  signOut(): Promise<void>
  getUser(): Promise<User | null>
  requireAuth(): Promise<User>
}

// Supabase Auth implementation
class SupabaseAuthService implements AuthService {
  async signIn(email: string, password: string): Promise<AuthResult> {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.user) {
      return { user: { id: '', email: '' }, error: error?.message || 'ログインに失敗しました' }
    }

    return {
      user: {
        id: data.user.id,
        email: data.user.email!,
        name: data.user.user_metadata?.name,
      },
    }
  }

  async signOut(): Promise<void> {
    const supabase = await createClient()
    await supabase.auth.signOut()
  }

  async getUser(): Promise<User | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    return {
      id: user.id,
      email: user.email!,
      name: user.user_metadata?.name,
    }
  }

  async requireAuth(): Promise<User> {
    const user = await this.getUser()
    if (!user) {
      redirect('/login')
    }
    return user
  }
}

// Export singleton instance
export const auth: AuthService = new SupabaseAuthService()
