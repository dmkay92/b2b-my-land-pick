import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChatProvider } from '@/lib/chat/ChatContext'
import { FloatingChat } from '@/components/chat/FloatingChat'

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, status, company_name').eq('id', user.id).single()

  if (profile?.role !== 'agency') redirect('/login')
  if (profile?.status !== 'approved') redirect('/pending')

  return (
    <ChatProvider>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
          <Link href="/agency" className="text-lg font-bold text-blue-600">견적 플랫폼</Link>
          <span className="text-sm text-gray-600">{profile.company_name} (여행사)</span>
        </header>
        <main>{children}</main>
        <FloatingChat />
      </div>
    </ChatProvider>
  )
}
