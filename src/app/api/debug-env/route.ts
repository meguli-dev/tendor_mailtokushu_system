import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ set' : '❌ missing',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ set' : '❌ missing',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ set' : '❌ missing',
    AWS_REGION: process.env.AWS_REGION ? '✅ set' : '❌ missing',
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? '✅ set' : '❌ missing',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '✅ set' : '❌ missing',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ? '✅ set' : '❌ missing',
    NODE_ENV: process.env.NODE_ENV,
  })
}
