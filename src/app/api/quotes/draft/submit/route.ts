import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthorizedLandco } from '@/lib/supabase/auth-helpers'
import { sendQuoteSubmittedEmail } from '@/lib/email/notifications'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user, error } = await getAuthorizedLandco(supabase)
  if (error) return error

  const { requestId, filePath, fileName } = await request.json() as {
    requestId: string
    filePath: string
    fileName: string
  }

  if (!requestId || !filePath || !fileName) {
    return NextResponse.json({ error: 'requestId, filePath, fileName이 모두 필요합니다.' }, { status: 400 })
  }

  // 0. quote_requests 정보 미리 조회 (event_name, agency_id)
  const { data: requestInfo, error: requestInfoError } = await supabase
    .from('quote_requests')
    .select('event_name, agency_id')
    .eq('id', requestId)
    .single()

  if (requestInfoError || !requestInfo) {
    return NextResponse.json({ error: '견적 요청을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 1. 버전 조회 (기존 quotes에서 max version)
  const { data: existing } = await supabase
    .from('quotes')
    .select('version')
    .eq('request_id', requestId)
    .eq('landco_id', user!.id)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1

  // 2. preview 파일을 Storage에서 정식 경로로 다운로드 후 재업로드
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('quotes')
    .download(filePath)

  if (downloadError || !fileData) {
    return NextResponse.json({ error: '파일 다운로드에 실패했습니다.' }, { status: 500 })
  }

  const timestamp = Date.now()
  const officialPath = `${requestId}/${user!.id}/v${nextVersion}_${timestamp}.xlsx`
  const arrayBuffer = await fileData.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from('quotes')
    .upload(officialPath, new Uint8Array(arrayBuffer), {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = await supabase.storage
    .from('quotes')
    .createSignedUrl(officialPath, 60 * 60 * 24 * 365)

  // 3. DB quotes 테이블에 insert
  const { data, error: insertError } = await supabase
    .from('quotes')
    .insert({
      request_id: requestId,
      landco_id: user!.id,
      version: nextVersion,
      file_url: urlData?.signedUrl ?? officialPath,
      file_name: fileName,
    })
    .select()
    .single()

  if (insertError) {
    // DB insert 실패 시 업로드된 파일 정리
    await supabase.storage.from('quotes').remove([officialPath])
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // 4. insert 성공 후 quote_requests status를 in_progress로 업데이트 (open → in_progress)
  await supabase
    .from('quote_requests')
    .update({ status: 'in_progress' })
    .eq('id', requestId)
    .eq('status', 'open')

  // 5. 알림 이메일 발송
  const { data: agencyInfo } = await supabase
    .from('profiles').select('email').eq('id', requestInfo.agency_id).single()
  const { data: landcoInfo } = await supabase
    .from('profiles').select('company_name').eq('id', user!.id).single()
  if (agencyInfo?.email) {
    await sendQuoteSubmittedEmail({
      to: agencyInfo.email,
      event_name: requestInfo.event_name,
      landco_name: landcoInfo?.company_name ?? '',
      request_id: requestId,
    })
  }

  // 6. draft 삭제
  await supabase
    .from('quote_drafts')
    .delete()
    .eq('request_id', requestId)
    .eq('landco_id', user!.id)

  return NextResponse.json({ data }, { status: 201 })
}
