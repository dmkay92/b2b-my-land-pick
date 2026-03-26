import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: request, error } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  const isOwner = request.agency_id === user.id
  const isLandco = profile?.role === 'landco'
  const isAdmin = profile?.role === 'admin'
  if (!isOwner && !isLandco && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: quotes } = await supabase
    .from('quotes')
    .select('*, profiles!quotes_landco_id_fkey(company_name)')
    .eq('request_id', id)
    .order('version', { ascending: false })

  return NextResponse.json({ request, quotes: quotes ?? [] })
}
