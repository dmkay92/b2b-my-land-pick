import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const {
    userId,
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
  } = await req.json()

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { error } = await supabase.from('profiles').update({
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
  }).eq('id', userId)

  if (error) {
    console.error('Profile update error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
