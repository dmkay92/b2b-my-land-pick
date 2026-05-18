import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthorizedLandco } from '@/lib/supabase/auth-helpers'
import type { ItineraryDay, PricingData } from '@/lib/supabase/types'

export async function GET() {
  const supabase = await createClient()
  const { user, error } = await getAuthorizedLandco(supabase)
  if (error) return error

  const { data } = await supabase
    .from('quote_templates')
    .select('id, name, created_at')
    .eq('landco_id', user!.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ templates: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user, error } = await getAuthorizedLandco(supabase)
  if (error) return error

  const { name, itinerary, pricing } = await request.json() as {
    name: string
    itinerary: ItineraryDay[]
    pricing: PricingData
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: '템플릿 이름을 입력해주세요.' }, { status: 400 })
  }

  const { data, error: insertError } = await supabase
    .from('quote_templates')
    .insert({ landco_id: user!.id, name: name.trim(), itinerary, pricing })
    .select('id, name, created_at')
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ template: data }, { status: 201 })
}
