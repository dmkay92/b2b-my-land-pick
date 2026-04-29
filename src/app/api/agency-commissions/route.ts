import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestId = request.nextUrl.searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  const { data: quotes } = await supabase
    .from('quotes')
    .select('id')
    .eq('request_id', requestId)

  const quoteIds = (quotes ?? []).map(q => q.id)
  if (quoteIds.length === 0) return NextResponse.json({ markups: [] })

  const { data: markups, error } = await supabase
    .from('agency_commissions')
    .select('*')
    .eq('agency_id', user.id)
    .in('quote_id', quoteIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ markups: markups ?? [] })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { quoteId, markupPerPerson, markupTotal } = await request.json()
  if (!quoteId) return NextResponse.json({ error: 'quoteId required' }, { status: 400 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await admin
    .from('agency_commissions')
    .upsert({
      quote_id: quoteId,
      agency_id: user.id,
      commission_per_person: markupPerPerson ?? 0,
      commission_total: markupTotal ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'quote_id,agency_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ markup: data })
}
