import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function checkAdmin(supabase: ReturnType<typeof getAdmin>) {
  // This is a helper but we need the auth supabase client
  return true // actual check done inline
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { countryCode, cityName } = await request.json()
  if (!countryCode || !cityName) return NextResponse.json({ error: 'countryCode, cityName 필요' }, { status: 400 })

  const admin = getAdmin()
  const { data: maxOrder } = await admin.from('cities').select('sort_order').eq('country_code', countryCode).order('sort_order', { ascending: false }).limit(1)
  const nextOrder = (maxOrder?.[0]?.sort_order ?? 0) + 1

  const { data, error } = await admin.from('cities').insert({ country_code: countryCode, city_name: cityName, sort_order: nextOrder }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ city: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { updates } = await request.json() as { updates: { id: string; sort_order: number }[] }
  const admin = getAdmin()
  for (const u of updates) {
    await admin.from('cities').update({ sort_order: u.sort_order }).eq('id', u.id)
  }
  return NextResponse.json({ success: true })
}
