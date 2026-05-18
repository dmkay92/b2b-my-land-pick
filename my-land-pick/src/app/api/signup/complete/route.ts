import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { generateProfileDisplayId } from '@/lib/display-id'
import { encryptPii } from '@/lib/privacy'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const {
    userId,
    email,
    role,
    company_name,
    business_registration_number,
    representative_name,
    phone_mobile,
    phone_landline,
    bank_name,
    bank_account,
    bank_holder,
    document_biz_url,
    document_bank_url,
    country_codes,
    service_areas,
  } = await req.json()

  if (!userId || !email || !role || !company_name) {
    return NextResponse.json({ error: 'userId, email, role, company_name required' }, { status: 400 })
  }

  const admin = getAdmin()

  // display_id 생성 (앱 레벨)
  const display_id = await generateProfileDisplayId(admin, role)

  // PII 필드 암호화 후 INSERT
  const profileData = await encryptPii({
    id: userId,
    email,
    role,
    company_name,
    status: role === 'admin' ? 'approved' : 'pending',
    display_id,
    business_registration_number: business_registration_number || null,
    representative_name: representative_name || null,
    phone_mobile: phone_mobile || null,
    phone_landline: phone_landline || null,
    bank_name: bank_name || null,
    bank_account: bank_account || null,
    bank_holder: bank_holder || null,
    document_biz_url: document_biz_url || null,
    document_bank_url: document_bank_url || null,
    ...(Array.isArray(country_codes) ? { country_codes } : {}),
    ...(Array.isArray(service_areas) ? { service_areas } : {}),
  })
  const { error } = await admin.from('profiles').insert(profileData)

  if (error) {
    console.error('Profile insert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
