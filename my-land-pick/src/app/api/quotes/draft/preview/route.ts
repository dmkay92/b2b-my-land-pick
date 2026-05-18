import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthorizedLandco } from '@/lib/supabase/auth-helpers'
import { generateFilledQuoteTemplate } from '@/lib/excel/template'
import { calculateTotalPeople } from '@/lib/utils'
import { workbookToHtml } from '@/lib/excel/workbookToHtml'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user, error } = await getAuthorizedLandco(supabase)
  if (error) return error

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
    .select('itinerary, pricing, includes, excludes')
    .eq('request_id', requestId)
    .eq('landco_id', user!.id)
    .single()

  if (draftError || !draft) return NextResponse.json({ error: '저장된 임시 견적서가 없습니다.' }, { status: 404 })

  // 3. 랜드사 이름 조회
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_name')
    .eq('id', user!.id)
    .single()

  // 4. 채워진 Excel 생성
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
      includes: draft.includes ?? '',
      excludes: draft.excludes ?? '',
    },
    {
      itinerary: draft.itinerary,
      pricing: draft.pricing,
    },
  )

  const buffer = await workbook.xlsx.writeBuffer()
  const timestamp = Date.now()
  const fileName = `견적서_미리보기_${qr.event_name}_${timestamp}.xlsx`

  // 4. buffer를 base64 data URL로 변환 (Storage 업로드 없이 다운로드 지원)
  const base64 = Buffer.from(buffer as ArrayBuffer).toString('base64')
  const fileUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`

  const previewHtml = workbookToHtml(workbook)

  return NextResponse.json({ fileUrl, filePath: '', fileName, previewHtml })
}
