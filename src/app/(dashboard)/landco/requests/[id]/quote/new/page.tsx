import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QuoteEditorShell } from '@/components/quote-editor/QuoteEditorShell'

export default async function QuoteEditorPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'landco' || profile.status !== 'approved') {
    redirect('/login')
  }

  const { data: request } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!request) redirect('/landco')

  return (
    <div className="min-h-screen bg-gray-50">
      <QuoteEditorShell request={request} />
    </div>
  )
}
