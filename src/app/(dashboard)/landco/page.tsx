import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDate, getStatusLabel } from '@/lib/utils'
import type { QuoteRequest } from '@/lib/supabase/types'

export default async function LancdoDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('country_codes').eq('id', user.id).single()

  const countryCodes = (profile?.country_codes ?? []) as string[]

  const { data: requests } = await supabase
    .from('quote_requests')
    .select('*')
    .in('destination_country', countryCodes.length > 0 ? countryCodes : ['__none__'])
    .in('status', ['open', 'in_progress'])
    .order('deadline', { ascending: true })

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">견적 요청 목록</h1>
      <p className="text-gray-500 text-sm mb-6">
        담당 국가: {countryCodes.length > 0 ? countryCodes.join(', ') : '미지정'}
      </p>

      {(!requests || requests.length === 0) ? (
        <div className="text-center py-20 text-gray-400">
          <p>현재 접수된 견적 요청이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(requests as QuoteRequest[]).map(req => {
            const today = new Date()
            const deadline = new Date(req.deadline)
            const daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

            return (
              <Link
                key={req.id}
                href={`/landco/requests/${req.id}`}
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
                    <p className={`text-xs mt-1 font-medium ${daysLeft <= 3 ? 'text-red-500' : 'text-gray-400'}`}>
                      마감: {formatDate(req.deadline)} {daysLeft > 0 ? `(D-${daysLeft})` : '(마감)'}
                    </p>
                  </div>
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
                    {getStatusLabel(req.status)}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
