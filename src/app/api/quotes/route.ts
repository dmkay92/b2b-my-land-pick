import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  return NextResponse.json({ data }, { status: 201 })
}
