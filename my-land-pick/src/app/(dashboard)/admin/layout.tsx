import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LogoutButton } from '@/components/LogoutButton'
import { AccountMenu } from '@/components/AccountMenu'
import { AgencySidebar } from '@/components/layout/AgencySidebar'
import { ChatProvider } from '@/lib/chat/ChatContext'
import { FloatingChat } from '@/components/chat/FloatingChat'
import { NotificationBell } from '@/components/notifications/NotificationBell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/login')

  return (
    <AgencySidebar
      companyName="관리자"
      role="admin"
      rightSlot={
        <>
          <NotificationBell userId={user.id} role="admin" />
          <AccountMenu email={user.email!} role="admin" companyName="관리자" />
          <LogoutButton />
        </>
      }
    >
      <ChatProvider>
        {children}
        <FloatingChat />
      </ChatProvider>
    </AgencySidebar>
  )
}
