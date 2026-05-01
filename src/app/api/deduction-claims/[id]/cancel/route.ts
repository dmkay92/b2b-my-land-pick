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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const admin = getAdmin()

  const { data: claim } = await admin.from('deduction_claims').select('*').eq('id', id).single()
  if (!claim) return NextResponse.json({ error: '공제 신청을 찾을 수 없습니다.' }, { status: 404 })
  if (claim.landco_id !== user.id) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  if (claim.status !== 'pending') return NextResponse.json({ error: '검토중인 건만 취소할 수 있습니다.' }, { status: 400 })

  await admin.from('deduction_claims').update({
    status: 'rejected',
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ success: true })
}
