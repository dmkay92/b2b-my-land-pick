import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthorizedLandco } from '@/lib/supabase/auth-helpers'
import { generateFilledQuoteTemplate } from '@/lib/excel/template'
import { workbookToHtml } from '@/lib/excel/workbookToHtml'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { error, user } = await getAuthorizedLandco(supabase)
  if (error) return error

  const { itinerary, pricing, templateName } = await request.json()
  if (!itinerary || !pricing) {
    return NextResponse.json({ error: 'itinerary, pricing이 필요합니다.' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_name')
    .eq('id', user!.id)
    .single()

  const workbook = await generateFilledQuoteTemplate(
    {
      event_name: templateName || '템플릿 미리보기',
      destination: '',
      depart_date: '',
      return_date: '',
      total_people: 0,
      hotel_grade: 3,
      landco_name: profile?.company_name ?? '',
      adults: 0,
      children: 0,
      infants: 0,
      leaders: 0,
      includes: '',
      excludes: '',
    },
    { itinerary, pricing },
  )

  const buffer = await workbook.xlsx.writeBuffer()
  const fileName = `템플릿_${templateName || '미리보기'}_${Date.now()}.xlsx`
  const base64 = Buffer.from(buffer as ArrayBuffer).toString('base64')
  const fileUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`
  const previewHtml = workbookToHtml(workbook)

  return NextResponse.json({ fileUrl, fileName, previewHtml })
}
