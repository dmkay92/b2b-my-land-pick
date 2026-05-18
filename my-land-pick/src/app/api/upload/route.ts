import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('file') as File
    const folder = formData.get('folder') as string || 'uploads'

    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${folder}/${Date.now()}_${safeName}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error } = await admin.storage.from('signup-documents').upload(path, buffer, {
      contentType: file.type || 'application/octet-stream',
    })

    if (error) {
      console.error('[upload] storage error:', error.message, 'path:', path)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ path })
  } catch (e) {
    console.error('[upload] unexpected error:', e)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
