import type { UserRole } from '@/lib/supabase/types'

interface Props {
  onSelect: (role: UserRole) => void
}

export function Step1Role({ onSelect }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">어떤 유형으로 가입하시나요?</h2>
        <p className="mt-1 text-sm text-gray-500">가입 유형은 이후 변경이 어려우니 신중하게 선택해주세요.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => onSelect('agency')}
          className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-gray-200 bg-white p-6 text-center hover:border-blue-500 hover:bg-blue-50 transition-all"
        >
          <span className="text-4xl">✈️</span>
          <div>
            <p className="font-semibold text-gray-900 group-hover:text-blue-700">여행사</p>
            <p className="mt-1 text-xs text-gray-400">인센티브 여행 견적을 요청하는 업체</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onSelect('landco')}
          className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-gray-200 bg-white p-6 text-center hover:border-blue-500 hover:bg-blue-50 transition-all"
        >
          <span className="text-4xl">🌍</span>
          <div>
            <p className="font-semibold text-gray-900 group-hover:text-blue-700">랜드사</p>
            <p className="mt-1 text-xs text-gray-400">현지 여행 서비스를 제공하는 업체</p>
          </div>
        </button>
      </div>
    </div>
  )
}
