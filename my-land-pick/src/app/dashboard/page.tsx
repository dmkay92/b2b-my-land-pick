import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, status').eq('id', user.id).single()

  if (!profile || profile.status === 'pending') redirect('/pending')
  if (profile.role === 'admin') redirect('/admin')
  if (profile.role === 'agency') redirect('/agency')
  redirect('/landco')
}
