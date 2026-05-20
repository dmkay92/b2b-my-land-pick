import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import { workbookToHtml } from '@/lib/excel/workbookToHtml'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const { id } = await params

  // admin은 RLS 우회
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const queryClient = profile?.role === 'admin'
    ? createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    : supabase

  const { data: quote, error } = await queryClient
    .from('quotes')
    .select('file_url, file_name')
    .eq('id', id)
    .single()

  if (error || !quote) {
    return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 })
  }

  // Storage에서 파일 다운로드
  const res = await fetch(quote.file_url)
  if (!res.ok) {
    return NextResponse.json({ error: '파일을 불러올 수 없습니다.' }, { status: 500 })
  }

  const buffer = await res.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const previewHtml = workbookToHtml(workbook)

  return NextResponse.json({ previewHtml, fileName: quote.file_name })
}
