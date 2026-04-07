import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthorizedLandco } from '@/lib/supabase/auth-helpers'
import type { ItineraryDay, PricingData } from '@/lib/supabase/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { user, error } = await getAuthorizedLandco(supabase)
  if (error) return error

  const { id } = await params

  const { data, error: fetchError } = await supabase
    .from('quote_templates')
    .select('id, name, itinerary, pricing, created_at')
    .eq('id', id)
    .eq('landco_id', user!.id)
    .single()

  if (fetchError || !data) {
    return NextResponse.json({ error: '템플릿을 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ template: data })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { user, error } = await getAuthorizedLandco(supabase)
  if (error) return error

  const { id } = await params
  const { name, itinerary, pricing } = await request.json() as {
    name: string
    itinerary: ItineraryDay[]
    pricing: PricingData
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: '템플릿 이름을 입력해주세요.' }, { status: 400 })
  }

  const { data, error: updateError } = await supabase
    .from('quote_templates')
    .update({ name: name.trim(), itinerary, pricing })
    .eq('id', id)
    .eq('landco_id', user!.id)
    .select('id, name, created_at')
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ template: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { user, error } = await getAuthorizedLandco(supabase)
  if (error) return error

  const { id } = await params

  const { error: deleteError } = await supabase
    .from('quote_templates')
    .delete()
    .eq('id', id)
    .eq('landco_id', user!.id)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
