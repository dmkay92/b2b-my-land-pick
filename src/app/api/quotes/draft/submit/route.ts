import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendQuoteSubmittedEmail } from '@/lib/email/notifications'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, status').eq('id', user.id).single()
  if (profile?.role !== 'landco' || profile?.status !== 'approved') {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })
  }

  const { requestId, fileUrl, fileName } = await request.json() as {
    requestId: string
    fileUrl: string
    fileName: string
  }

  if (!requestId || !fileUrl || !fileName) {
    return NextResponse.json({ error: 'requestId, fileUrl, fileName이 모두 필요합니다.' }, { status: 400 })
  }

  // 1. 버전 조회 (기존 quotes에서 max version)
  const { data: existing } = await supabase
    .from('quotes')
    .select('version')
    .eq('request_id', requestId)
    .eq('landco_id', user.id)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1

  // 2. preview 파일을 Storage에서 정식 경로로 다운로드 후 재업로드
  // signed URL에서 파일 경로 추출 (drafts/{requestId}/{userId}/preview_*.xlsx)
  const urlObj = new URL(fileUrl)
  const pathParts = urlObj.pathname.split('/object/sign/quotes/')
  const sourcePath = pathParts.length > 1 ? decodeURIComponent(pathParts[1].split('?')[0]) : null

  if (!sourcePath) {
    return NextResponse.json({ error: '파일 경로를 파악할 수 없습니다.' }, { status: 400 })
  }

  // Storage에서 파일 다운로드
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('quotes')
    .download(sourcePath)

  if (downloadError || !fileData) {
    return NextResponse.json({ error: '파일 다운로드에 실패했습니다.' }, { status: 500 })
  }

  // 정식 경로로 업로드
  const timestamp = Date.now()
  const officialPath = `${requestId}/${user.id}/v${nextVersion}_${timestamp}.xlsx`
  const arrayBuffer = await fileData.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from('quotes')
    .upload(officialPath, new Uint8Array(arrayBuffer), {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // signed URL 생성 (1년 유효)
  const { data: urlData } = await supabase.storage
    .from('quotes')
    .createSignedUrl(officialPath, 60 * 60 * 24 * 365)

  // 3. DB quotes 테이블에 insert
  const { data, error: insertError } = await supabase
    .from('quotes')
    .insert({
      request_id: requestId,
      landco_id: user.id,
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

  // 4. quote_requests status를 in_progress로 업데이트
  await supabase
    .from('quote_requests')
    .update({ status: 'in_progress' })
    .eq('id', requestId)
    .eq('status', 'open')

  // 5. 알림 이메일 발송
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

  // 6. draft 삭제
  await supabase
    .from('quote_drafts')
    .delete()
    .eq('request_id', requestId)
    .eq('landco_id', user.id)

  return NextResponse.json({ data }, { status: 201 })
}
