import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: existing } = await supabase
    .from('quote_requests')
    .select('agency_id, status')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.agency_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (existing.status === 'finalized') {
    return NextResponse.json({ error: '확정된 요청은 취소할 수 없습니다.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('quote_requests')
    .update({ status: 'closed' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/agency')
  return NextResponse.json({ success: true })
}
