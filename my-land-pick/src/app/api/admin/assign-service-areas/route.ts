import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { landcoId, serviceAreas } = await request.json() as {
    landcoId: string
    serviceAreas: { country: string; city: string }[]
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: current } = await admin
    .from('profiles').select('service_areas, country_codes').eq('id', landcoId).single()

  // Update service_areas + sync country_codes
  const uniqueCountries = [...new Set(serviceAreas.map(a => a.country))]

  const { error } = await admin.from('profiles').update({
    service_areas: serviceAreas,
    country_codes: uniqueCountries,
  }).eq('id', landcoId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('admin_action_logs').insert({
    target_user_id: landcoId,
    action_type: 'service_areas_change',
    detail: { from: current?.service_areas ?? [], to: serviceAreas },
  })

  return NextResponse.json({ success: true })
}
