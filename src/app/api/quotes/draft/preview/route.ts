import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateFilledQuoteTemplate } from '@/lib/excel/template'
import { calculateTotalPeople } from '@/lib/utils'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, status').eq('id', user.id).single()
  if (profile?.role !== 'landco' || profile?.status !== 'approved') {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })
  }

  const { requestId } = await request.json() as { requestId: string }
  if (!requestId) return NextResponse.json({ error: 'requestId가 필요합니다.' }, { status: 400 })

  // 1. quote_requests 조회
  const { data: qr, error: qrError } = await supabase
    .from('quote_requests')
    .select('event_name, destination_country, destination_city, depart_date, return_date, adults, children, infants, leaders, hotel_grade')
    .eq('id', requestId)
    .single()

  if (qrError || !qr) return NextResponse.json({ error: '견적 요청을 찾을 수 없습니다.' }, { status: 404 })

  // 2. 현재 유저의 draft 조회
  const { data: draft, error: draftError } = await supabase
    .from('quote_drafts')
    .select('itinerary, pricing')
    .eq('request_id', requestId)
    .eq('landco_id', user.id)
    .single()

  if (draftError || !draft) return NextResponse.json({ error: '저장된 임시 견적서가 없습니다.' }, { status: 404 })

  // 3. 채워진 Excel 생성
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
    },
    {
      itinerary: draft.itinerary,
      pricing: draft.pricing,
    },
  )

  const buffer = await workbook.xlsx.writeBuffer()
  const timestamp = Date.now()
  const filePath = `drafts/${requestId}/${user.id}/preview_${timestamp}.xlsx`
  const fileName = `견적서_미리보기_${qr.event_name}_${timestamp}.xlsx`

  // 4. Supabase Storage 업로드
  const { error: uploadError } = await supabase.storage
    .from('quotes')
    .upload(filePath, new Uint8Array(buffer as ArrayBuffer), {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // 5. signed URL 생성 (1시간)
  const { data: urlData, error: urlError } = await supabase.storage
    .from('quotes')
    .createSignedUrl(filePath, 60 * 60)

  if (urlError || !urlData?.signedUrl) {
    return NextResponse.json({ error: 'URL 생성에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ url: urlData.signedUrl, fileName })
}
