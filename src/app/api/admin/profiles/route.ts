import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { userId } = body
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: current } = await admin
    .from('profiles').select('email, representative_name, phone_landline, phone_mobile, bank_name, bank_account, bank_holder, partner_code').eq('id', userId).single()

  const updateFields: Record<string, unknown> = {}
  const changes: { field: string; from: unknown; to: unknown }[] = []

  const editableFields = [
    { key: 'email', label: '이메일' },
    { key: 'representative_name', label: '대표자명' },
    { key: 'phone_landline', label: '유선' },
    { key: 'phone_mobile', label: '휴대폰' },
    { key: 'bank_name', label: '은행' },
    { key: 'bank_account', label: '계좌번호' },
    { key: 'bank_holder', label: '예금주' },
    { key: 'partner_code', label: '거래처코드' },
  ] as const

  for (const f of editableFields) {
    if (body[f.key] !== undefined && body[f.key] !== (current as Record<string, unknown>)?.[f.key]) {
      updateFields[f.key] = body[f.key]
      changes.push({ field: f.label, from: (current as Record<string, unknown>)?.[f.key] ?? null, to: body[f.key] })
    }
  }

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json({ success: true, message: 'no changes' })
  }

  const { error } = await admin.from('profiles').update(updateFields).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('admin_action_logs').insert({
    target_user_id: userId,
    action_type: 'profile_update',
    detail: { changes },
  })

  return NextResponse.json({ success: true })
}
