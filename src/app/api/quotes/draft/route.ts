import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthorizedLandco } from '@/lib/supabase/auth-helpers'
import type { ItineraryDay, PricingData } from '@/lib/supabase/types'

async function getAuthorizedUser() {
  const supabase = await createClient()
  const { user, error } = await getAuthorizedLandco(supabase)
  return { supabase, user, error }
}

// GET ?requestId=<uuid>
export async function GET(request: NextRequest) {
  const { supabase, user, error } = await getAuthorizedUser()
  if (error) return error

  const requestId = request.nextUrl.searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId가 필요합니다.' }, { status: 400 })

  const { data: draft } = await supabase
    .from('quote_drafts')
    .select('*')
    .eq('request_id', requestId)
    .eq('landco_id', user!.id)
    .single()

  return NextResponse.json({ draft: draft ?? null })
}

// PUT body: { requestId, itinerary, pricing }
export async function PUT(request: NextRequest) {
  const { supabase, user, error } = await getAuthorizedUser()
  if (error) return error

  const body = await request.json() as {
    requestId: string
    itinerary: ItineraryDay[]
    pricing: PricingData
  }
  const { requestId, itinerary, pricing } = body

  if (!requestId || !itinerary || !pricing) {
    return NextResponse.json({ error: 'requestId, itinerary, pricing이 모두 필요합니다.' }, { status: 400 })
  }

  const { data: draft, error: upsertError } = await supabase
    .from('quote_drafts')
    .upsert(
      {
        request_id: requestId,
        landco_id: user!.id,
        itinerary,
        pricing,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'request_id,landco_id' },
    )
    .select()
    .single()

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })

  return NextResponse.json({ draft })
}

// DELETE ?requestId=<uuid>
export async function DELETE(request: NextRequest) {
  const { supabase, user, error } = await getAuthorizedUser()
  if (error) return error

  const requestId = request.nextUrl.searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId가 필요합니다.' }, { status: 400 })

  const { error: deleteError } = await supabase
    .from('quote_drafts')
    .delete()
    .eq('request_id', requestId)
    .eq('landco_id', user!.id)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
