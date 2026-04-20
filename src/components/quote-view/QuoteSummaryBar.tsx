'use client'

interface Props {
  total: number
  perPerson: number
  agencyMarkup?: number
}

function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR')
}

export default function QuoteSummaryBar({ total, perPerson, agencyMarkup }: Props) {
  return (
    <div className="flex items-center gap-6 bg-white border border-gray-200 rounded-lg px-6 py-4 shadow-sm">
      <div>
        <div className="text-xs text-gray-500">총액</div>
        <div className="text-xl font-bold">{formatNumber(total)}원</div>
      </div>
      <div className="h-8 w-px bg-gray-200" />
      <div>
        <div className="text-xs text-gray-500">1인당</div>
        <div className="text-xl font-bold">{formatNumber(perPerson)}원</div>
      </div>
      {agencyMarkup !== undefined && agencyMarkup > 0 && (
        <>
          <div className="h-8 w-px bg-gray-200" />
          <div>
            <div className="text-xs text-gray-500">여행사 수익</div>
            <div className="text-xl font-bold text-blue-600">+{formatNumber(agencyMarkup)}원</div>
          </div>
        </>
      )}
    </div>
  )
}
