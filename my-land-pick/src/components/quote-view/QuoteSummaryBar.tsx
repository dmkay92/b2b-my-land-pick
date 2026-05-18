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
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 shadow-sm">
          <div className="text-[11px] font-medium text-gray-400 tracking-wide mb-1">총액</div>
          <div className="text-2xl font-bold tracking-tight">{fmt(total)}<span className="text-sm font-medium text-gray-400 ml-0.5">원</span></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 shadow-sm">
          <div className="text-[11px] font-medium text-gray-400 tracking-wide mb-1">1인당</div>
          <div className="text-2xl font-bold tracking-tight">{fmt(perPerson)}<span className="text-sm font-medium text-gray-400 ml-0.5">원</span></div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[1fr_auto_1fr_auto_1.2fr] items-center gap-0">
      {/* 랜드사 견적가 */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 shadow-sm">
        <div className="text-[11px] font-medium text-gray-400 tracking-wide mb-1">랜드사 견적가</div>
        <div className="text-lg font-bold tracking-tight text-gray-700">{fmt(landcoTotal)}<span className="text-xs font-medium text-gray-400 ml-0.5">원</span></div>
        <div className="text-[11px] text-gray-400 mt-0.5">1인당 {fmt(landcoPerPerson)}원</div>
      </div>

      {/* + */}
      <div className="flex items-center justify-center w-8">
        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-gray-400 text-sm font-bold leading-none">+</span>
        </div>
      </div>

      {/* 여행사 커미션 */}
      <div className="bg-blue-50 rounded-xl border border-blue-100 px-5 py-4 shadow-sm">
        <div className="text-[11px] font-medium text-blue-500 tracking-wide mb-1">여행사 커미션</div>
        <div className="text-lg font-bold tracking-tight text-blue-600">{fmt(agencyMarkup)}<span className="text-xs font-medium text-blue-400 ml-0.5">원</span></div>
        {totalPeople && (
          <div className="text-[11px] text-blue-400 mt-0.5">1인당 {fmt(Math.round(agencyMarkup / totalPeople))}원</div>
        )}
      </div>

      {/* = */}
      <div className="flex items-center justify-center w-8">
        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-gray-400 text-sm font-bold leading-none">=</span>
        </div>
      </div>

      {/* 최종 고객가 */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl px-5 py-4 shadow-md">
        <div className="text-[11px] font-medium text-gray-400 tracking-wide mb-1">최종 고객가</div>
        <div className="text-xl font-bold tracking-tight text-white">{fmt(total)}<span className="text-sm font-medium text-gray-400 ml-0.5">원</span></div>
        <div className="text-[11px] text-gray-400 mt-0.5">1인당 {fmt(perPerson)}원</div>
      </div>
    </div>
  )
}
