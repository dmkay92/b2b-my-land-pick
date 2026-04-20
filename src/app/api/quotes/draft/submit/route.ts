import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthorizedLandco } from '@/lib/supabase/auth-helpers'
import { generateFilledQuoteTemplate } from '@/lib/excel/template'
import { calculateTotalPeople } from '@/lib/utils'
import { sendQuoteSubmittedEmail } from '@/lib/email/notifications'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user, error } = await getAuthorizedLandco(supabase)
  if (error) return error

  const { requestId } = await request.json() as { requestId: string }

  if (!requestId) {
    return NextResponse.json({ error: 'requestId가 필요합니다.' }, { status: 400 })
  }

  // 1. quote_requests 조회
  const { data: qr, error: qrError } = await supabase
    .from('quote_requests')
    .select('event_name, destination_country, destination_city, depart_date, return_date, adults, children, infants, leaders, hotel_grade, agency_id')
    .eq('id', requestId)
    .single()

  if (qrError || !qr) {
    return NextResponse.json({ error: '견적 요청을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 2. draft 조회
  const { data: draft, error: draftError } = await supabase
    .from('quote_drafts')
    .select('itinerary, pricing')
    .eq('request_id', requestId)
    .eq('landco_id', user!.id)
    .single()

  if (draftError || !draft) {
    return NextResponse.json({ error: '저장된 임시 견적서가 없습니다.' }, { status: 404 })
  }

  // 3. 랜드사 이름 조회
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_name')
    .eq('id', user!.id)
    .single()

  // 4. Excel 생성
  const totalPeople = calculateTotalPeople({
    adults: qr.adults,
    children: qr.children,
    infants: qr.infants,
    leaders: qr.leaders,
  })

  const workbook = await generateFilledQuoteTemplate(
    {
      event_name: qr.event_name,
      destination: `${qr.destination_city} (${qr.destination_country})`,
      depart_date: qr.depart_date,
      return_date: qr.return_date,
      total_people: totalPeople,
      hotel_grade: qr.hotel_grade ?? 3,
      landco_name: profile?.company_name ?? '',
      adults: qr.adults ?? 0,
      children: qr.children ?? 0,
      infants: qr.infants ?? 0,
      leaders: qr.leaders ?? 0,
      includes: '',
      excludes: '',
    },
    {
      itinerary: draft.itinerary,
      pricing: draft.pricing,
    },
  )

  const buffer = await workbook.xlsx.writeBuffer()

  // 5. 버전 조회
  const { data: existing } = await supabase
    .from('quotes')
    .select('version')
    .eq('request_id', requestId)
    .eq('landco_id', user!.id)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1

  // 6. Storage 업로드
  const timestamp = Date.now()
  const fileName = `견적서_${qr.event_name}_${timestamp}.xlsx`
  const officialPath = `${requestId}/${user!.id}/v${nextVersion}_${timestamp}.xlsx`

  const { error: uploadError } = await supabase.storage
    .from('quotes')
    .upload(officialPath, new Uint8Array(buffer as ArrayBuffer), {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = await supabase.storage
    .from('quotes')
    .createSignedUrl(officialPath, 60 * 60 * 24 * 365)

  // 7. DB insert
  const { data, error: insertError } = await supabase
    .from('quotes')
    .insert({
      request_id: requestId,
      landco_id: user!.id,
      version: nextVersion,
      file_url: urlData?.signedUrl ?? officialPath,
      file_name: fileName,
      itinerary: draft.itinerary,
      pricing: draft.pricing,
    })
    .select()
    .single()

  if (insertError) {
    await supabase.storage.from('quotes').remove([officialPath])
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // 8. quote_requests status 업데이트
  await supabase
    .from('quote_requests')
    .update({ status: 'in_progress' })
    .eq('id', requestId)
    .eq('status', 'open')

  // 9. 이메일 발송
  const { data: agencyInfo } = await supabase
    .from('profiles').select('email').eq('id', qr.agency_id).single()
  if (agencyInfo?.email) {
    await sendQuoteSubmittedEmail({
      to: agencyInfo.email,
      event_name: qr.event_name,
      landco_name: profile?.company_name ?? '',
      request_id: requestId,
    })
  }

  // 10. draft 삭제
  await supabase
    .from('quote_drafts')
    .delete()
    .eq('request_id', requestId)
    .eq('landco_id', user!.id)

  return NextResponse.json({ data }, { status: 201 })
}
