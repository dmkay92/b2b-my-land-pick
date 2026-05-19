'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CalendarView, type CalendarEvent } from '@/components/CalendarView'

function getDisplayStatus(status: string, returnDate: string) {
  if (status === 'finalized' && returnDate < new Date().toISOString().slice(0, 10)) return 'completed'
  return status
}

export default function AgencyCalendarPage() {
  const router = useRouter()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('quote_requests')
        .select('id, event_name, depart_date, return_date, status, display_id')
        .eq('agency_id', user.id)
        .order('depart_date', { ascending: false })

      setEvents((data ?? []).map(r => ({
        id: r.id,
        title: r.event_name,
        startDate: r.depart_date?.slice(0, 10),
        endDate: r.return_date?.slice(0, 10),
        status: getDisplayStatus(r.status, r.return_date?.slice(0, 10)),
      })))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">여행 캘린더</h1>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <CalendarView
          events={events}
          onEventClick={ev => router.push(`/agency/requests/${ev.id}`)}
        />
      </div>
    </div>
  )
}
