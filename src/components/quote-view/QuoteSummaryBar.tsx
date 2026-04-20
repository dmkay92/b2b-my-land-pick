'use client'

interface Props {
  total: number
  perPerson: number
  agencyMarkup?: number
  totalPeople?: number
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR')
}

export default function QuoteSummaryBar({ total, perPerson, agencyMarkup, totalPeople }: Props) {
  const hasMarkup = agencyMarkup !== undefined && agencyMarkup > 0
  const landcoTotal = hasMarkup ? total - agencyMarkup : total
  const landcoPerPerson = hasMarkup && totalPeople ? Math.round(landcoTotal / totalPeople) : perPerson

  if (!hasMarkup) {
    return (
      <div className="flex items-center gap-6 bg-white border border-gray-200 rounded-lg px-6 py-4 shadow-sm">
        <div>
          <div className="text-xs text-gray-500">총액</div>
          <div className="text-xl font-bold">{fmt(total)}원</div>
        </div>
        <div className="h-8 w-px bg-gray-200" />
        <div>
          <div className="text-xs text-gray-500">1인당</div>
          <div className="text-xl font-bold">{fmt(perPerson)}원</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-stretch">
        {/* 랜드사 견적가 */}
        <div className="flex-1 px-5 py-3 border-r border-gray-100">
          <div className="text-[10px] text-gray-400 mb-0.5">랜드사 견적가</div>
          <div className="text-base font-semibold text-gray-600">{fmt(landcoTotal)}원</div>
          <div className="text-[10px] text-gray-400">1인당 {fmt(landcoPerPerson)}원</div>
        </div>

        {/* + 여행사 커미션 */}
        <div className="flex items-center px-3">
          <span className="text-gray-300 text-lg">+</span>
        </div>
        <div className="flex-1 px-5 py-3 border-r border-gray-100">
          <div className="text-[10px] text-blue-500 mb-0.5">여행사 커미션</div>
          <div className="text-base font-semibold text-blue-600">{fmt(agencyMarkup)}원</div>
          {totalPeople && (
            <div className="text-[10px] text-blue-400">1인당 {fmt(Math.round(agencyMarkup / totalPeople))}원</div>
          )}
        </div>

        {/* = 최종 고객가 */}
        <div className="flex items-center px-3">
          <span className="text-gray-300 text-lg">=</span>
        </div>
        <div className="flex-1 px-5 py-3 bg-blue-50 border-l-2 border-blue-500">
          <div className="text-[10px] text-blue-500 mb-0.5">최종 고객가</div>
          <div className="text-lg font-bold text-gray-900">{fmt(total)}원</div>
          <div className="text-[10px] text-gray-500">1인당 {fmt(perPerson)}원</div>
        </div>
      </div>
    </div>
  )
}
