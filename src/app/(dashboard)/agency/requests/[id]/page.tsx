'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { formatDate, calculateTotalPeople, hotelGradeLabel } from '@/lib/utils'
import type { QuoteRequest, Quote } from '@/lib/supabase/types'

interface QuoteWithLandco extends Quote {
  profiles: { company_name: string }
}

interface GroupedQuotes {
  [landcoId: string]: {
    company_name: string
    quotes: Quote[]
  }
}

export default function AgencyRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const [request, setRequest] = useState<QuoteRequest | null>(null)
  const [grouped, setGrouped] = useState<GroupedQuotes>({})

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/requests/${id}`)
      const json = await res.json()
      setRequest(json.request)

      // 랜드사별로 그룹핑
      const quotes: QuoteWithLandco[] = json.quotes ?? []
      const groups: GroupedQuotes = {}
      quotes.forEach(q => {
        if (!groups[q.landco_id]) {
          groups[q.landco_id] = {
            company_name: q.profiles?.company_name ?? '알 수 없음',
            quotes: [],
          }
        }
        groups[q.landco_id].quotes.push(q)
      })
      setGrouped(groups)
    }
    load()
  }, [id])

  if (!request) return <div className="p-8 text-gray-400">로딩 중...</div>

  const total = calculateTotalPeople(request)
  const landcoCount = Object.keys(grouped).length

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">{request.event_name}</h1>
      <p className="text-gray-500 text-sm mb-1">
        {request.destination_city} ({request.destination_country}) ·
        {formatDate(request.depart_date)} ~ {formatDate(request.return_date)} ·
        총 {total}명 · {hotelGradeLabel(request.hotel_grade)}
      </p>
      <p className="text-gray-400 text-xs mb-6">견적 마감: {formatDate(request.deadline)}</p>

      <h2 className="text-lg font-semibold mb-4">
        랜드사 견적서
        <span className="text-gray-400 font-normal text-sm ml-2">{landcoCount}개 랜드사 제출</span>
      </h2>

      {landcoCount === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-lg shadow-sm">
          아직 제출된 견적서가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([landcoId, { company_name, quotes }]) => (
            <div key={landcoId} className="bg-white rounded-lg shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{company_name}</h3>
                <span className="text-xs text-gray-400">{quotes.length}개 버전</span>
              </div>
              <div className="space-y-2">
                {quotes
                  .sort((a, b) => b.version - a.version)
                  .map(q => (
                    <div key={q.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded font-medium">
                          v{q.version}
                        </span>
                        <span className="text-sm text-gray-600">{q.file_name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">
                          {new Date(q.submitted_at).toLocaleString('ko-KR')}
                        </span>
                        <a
                          href={q.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 text-sm hover:underline"
                        >
                          다운로드
                        </a>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
