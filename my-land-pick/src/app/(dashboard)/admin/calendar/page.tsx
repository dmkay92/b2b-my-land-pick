'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarView, type CalendarEvent } from '@/components/CalendarView'

function getDisplayStatus(r: { status: string; return_date: string }) {
  if (r.status === 'finalized' && r.return_date < new Date().toISOString().slice(0, 10)) return 'completed'
  return r.status
}

export default function AdminCalendarPage() {
  const router = useRouter()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/admin/quote-requests')
      if (res.ok) {
        const { rows } = await res.json()
        setEvents((rows ?? []).map((r: { id: string; event_name: string; depart_date: string; return_date: string; status: string; agency_name: string }) => ({
          id: r.id,
          title: `${r.event_name} (${r.agency_name})`,
          startDate: r.depart_date,
          endDate: r.return_date,
          status: getDisplayStatus(r),
        })))
      }
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
          onEventClick={ev => router.push(`/admin/requests/${ev.id}`)}
        />
      </div>
    </div>
  )
}
