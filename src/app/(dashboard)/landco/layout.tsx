import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChatProvider } from '@/lib/chat/ChatContext'
import { FloatingChat } from '@/components/chat/FloatingChat'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { LogoutButton } from '@/components/LogoutButton'
import { AccountMenu } from '@/components/AccountMenu'
import { AgencySidebar } from '@/components/layout/AgencySidebar'

export default async function LandcoLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, status, company_name').eq('id', user.id).single()

  if (profile?.role !== 'landco') redirect('/login')
  if (profile?.status !== 'approved') redirect('/pending')

  const rightSlot = (
    <>
      <AccountMenu email={user.email!} role="landco" companyName={profile.company_name} />
      <NotificationBell userId={user.id} />
      <LogoutButton />
    </>
  )

  return (
    <ChatProvider>
      <AgencySidebar companyName={profile.company_name} role="landco" rightSlot={rightSlot}>
        {children}
      </AgencySidebar>
      <FloatingChat />
    </ChatProvider>
  )
}
