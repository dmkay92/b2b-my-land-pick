import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const targetId = req.nextUrl.searchParams.get('id')

  // 공개 프로필 조회 (id 파라미터가 있는 경우)
  if (targetId) {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data } = await admin.from('profiles')
      .select('id, company_name, description, introduction, profile_image, specialties, experience_years, highlights, country_codes, service_areas')
      .eq('id', targetId)
      .eq('role', 'landco')
      .single()
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ profile: data })
  }

  // 내 프로필 조회
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase.from('profiles')
    .select('description, introduction, profile_image, specialties, experience_years, highlights')
    .eq('id', user.id).single()
  return NextResponse.json(data ?? {})
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const update: Record<string, unknown> = {}
  if (body.description !== undefined) update.description = (body.description ?? '').slice(0, 200)
  if (body.introduction !== undefined) update.introduction = (body.introduction ?? '').slice(0, 2000)
  if (body.profile_image !== undefined) update.profile_image = body.profile_image
  if (body.specialties !== undefined) update.specialties = body.specialties
  if (body.experience_years !== undefined) update.experience_years = body.experience_years
  if (body.highlights !== undefined) update.highlights = body.highlights

  const { error } = await admin.from('profiles').update(update).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
