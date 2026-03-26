import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatDate, getStatusLabel } from '@/lib/utils'
import type { QuoteRequest } from '@/lib/supabase/types'

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  in_progress: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-600',
  finalized: 'bg-purple-100 text-purple-700',
}

export default async function AgencyDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: requests } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('agency_id', user!.id)
    .order('created_at', { ascending: false })

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">내 견적 요청</h1>
        <Link
          href="/agency/requests/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
        >
          + 새 견적 요청
        </Link>
      </div>

      {(!requests || requests.length === 0) ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg mb-2">견적 요청이 없습니다.</p>
          <Link href="/agency/requests/new" className="text-blue-500 hover:underline">
            첫 견적 요청 작성하기
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {(requests as QuoteRequest[]).map(req => (
            <Link
              key={req.id}
              href={`/agency/requests/${req.id}`}
              className="block bg-white p-5 rounded-lg shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-lg">{req.event_name}</h2>
                  <p className="text-gray-500 text-sm mt-1">
                    {req.destination_city} ({req.destination_country}) ·
                    {formatDate(req.depart_date)} ~ {formatDate(req.return_date)} ·
                    {req.hotel_grade}성급
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    마감: {formatDate(req.deadline)}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[req.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {getStatusLabel(req.status)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
