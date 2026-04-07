import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendQuoteSubmittedEmail } from '@/lib/email/notifications'

// GET: 현재 랜드사가 제출한 전체 견적 목록 (quote_requests 조인)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: quotes } = await supabase
    .from('quotes')
    .select(`
      id,
      request_id,
      version,
      file_url,
      file_name,
      status,
      submitted_at,
      quote_requests (
        id,
        event_name,
        destination_country,
        destination_city,
        depart_date,
        return_date,
        adults,
        children,
        infants,
        leaders,
        status
      )
    `)
    .eq('landco_id', user.id)
    .order('submitted_at', { ascending: false })

  // 랜드사 본인이 선택된 요청의 선택 정보 조회 (RLS: landco_id = auth.uid())
  const requestIds = [...new Set((quotes ?? []).map(q => q.request_id))]
  const selections: Record<string, string> = {}
  if (requestIds.length > 0) {
    const { data: selData } = await supabase
      .from('quote_selections')
      .select('request_id, selected_quote_id')
      .in('request_id', requestIds)
    selData?.forEach(s => { selections[s.request_id] = s.selected_quote_id })
  }

  return NextResponse.json({ quotes: quotes ?? [], selections })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, status').eq('id', user.id).single()
  if (profile?.role !== 'landco' || profile?.status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File
  const requestId = formData.get('requestId') as string

  if (!file || !requestId) {
    return NextResponse.json({ error: 'file and requestId required' }, { status: 400 })
  }

  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (!file.name.endsWith('.xlsx') || (file.type && file.type !== XLSX_MIME)) {
    return NextResponse.json({ error: '.xlsx 파일만 업로드 가능합니다.' }, { status: 400 })
  }

  // 기존 버전 조회
  const { data: existing } = await supabase
    .from('quotes')
    .select('version')
    .eq('request_id', requestId)
    .eq('landco_id', user.id)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1

  // Supabase Storage 업로드
  const filePath = `${requestId}/${user.id}/v${nextVersion}_${Date.now()}.xlsx`
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('quotes')
    .upload(filePath, new Uint8Array(arrayBuffer), {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // signed URL 생성 (1년 유효)
  const { data: urlData } = await supabase.storage
    .from('quotes')
    .createSignedUrl(filePath, 60 * 60 * 24 * 365)

  // DB 저장
  const { data, error } = await supabase.from('quotes').insert({
    request_id: requestId,
    landco_id: user.id,
    version: nextVersion,
    file_url: urlData?.signedUrl ?? filePath,
    file_name: file.name,
  }).select().single()

  if (error) {
    // DB insert 실패 시 업로드된 파일 정리
    await supabase.storage.from('quotes').remove([filePath])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // quote_requests 상태를 in_progress로 업데이트
  await supabase
    .from('quote_requests')
    .update({ status: 'in_progress' })
    .eq('id', requestId)
    .eq('status', 'open')

  const { data: requestInfo } = await supabase
    .from('quote_requests')
    .select('event_name, agency_id')
    .eq('id', requestId)
    .single()

  if (requestInfo) {
    const { data: agencyInfo } = await supabase
      .from('profiles').select('email').eq('id', requestInfo.agency_id).single()
    const { data: landcoInfo } = await supabase
      .from('profiles').select('company_name').eq('id', user.id).single()
    if (agencyInfo?.email) {
      await sendQuoteSubmittedEmail({
        to: agencyInfo.email,
        event_name: requestInfo.event_name,
        landco_name: landcoInfo?.company_name ?? '',
        request_id: requestId,
      })
    }
  }

  return NextResponse.json({ data }, { status: 201 })
}
