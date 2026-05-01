/**
 * 행사 취소 환불/공제 계산
 *
 * 취소 규정:
 * - 출발 7일 이전: 총 고객가의 100% 환불 (실비 공제)
 * - 출발 1~6일 전: 총 고객가의 50% 환불
 * - 출발 당일/노쇼: 환불 없음
 */

export interface RefundCalcInput {
  totalCustomerPrice: number  // 총 고객가 (랜드사 견적가 + 여행사 수수료)
  landcoQuoteTotal: number    // 랜드사 견적가
  agencyCommission: number    // 여행사 수수료
  paidAmount: number          // 결제완료액
  daysUntilDepart: number     // 출발까지 남은 일수
  approvedDeduction: number   // 승인된 공제액
}

export interface RefundCalcResult {
  refundRate: number           // 환불률 (1.0, 0.5, 0)
  refundRateLabel: string      // "100%" / "50%" / "0%"
  policyLabel: string          // 취소 규정 설명

  customerRefundBase: number   // 고객 기본 환불액 (총 고객가 × 환불률)
  cancellationFee: number      // 취소 수수료 (총 고객가 - 환불액)

  landcoBase: number           // 랜드사 기본 보유액 (견적가 × (1 - 환불률))
  agencyBase: number           // 여행사 기본 수수료 (수수료 × (1 - 환불률))

  deductionExcess: number      // 공제 초과분 (공제액 - 랜드사 기본 보유액, 0 이상)
  agencyFinalCommission: number // 여행사 최종 수수료 (초과 시 0)
  agencyAdditionalCharge: number // 여행사 추가 청구액

  customerFinalRefund: number  // 고객 최종 환불액
  landcoFinalPayout: number    // 랜드사 최종 수령액
}

export function calculateRefund(input: RefundCalcInput): RefundCalcResult {
  const { totalCustomerPrice, landcoQuoteTotal, agencyCommission, paidAmount, daysUntilDepart, approvedDeduction } = input

  // 1. 환불률 결정
  let refundRate: number
  let refundRateLabel: string
  let policyLabel: string
  if (daysUntilDepart >= 7) {
    refundRate = 1.0
    refundRateLabel = '100%'
    policyLabel = '출발 7일 이전: 총 고객가의 100% 환불 (실비 공제)'
  } else if (daysUntilDepart >= 1) {
    refundRate = 0.5
    refundRateLabel = '50%'
    policyLabel = `출발 ${daysUntilDepart}일 전: 총 고객가의 50% 환불`
  } else {
    refundRate = 0
    refundRateLabel = '0%'
    policyLabel = '출발 당일/노쇼: 환불 없음'
  }

  // 2. 기본 계산
  const customerRefundBase = Math.round(totalCustomerPrice * refundRate)
  const cancellationFee = totalCustomerPrice - customerRefundBase

  // 취소 수수료 배분
  const landcoBase = Math.round(landcoQuoteTotal * (1 - refundRate))
  const agencyBase = Math.round(agencyCommission * (1 - refundRate))

  // 3. 공제 처리
  // 핵심: 공제액은 환불액에서 차감됨
  // - 공제 ≤ 취소수수료 내 랜드사 몫: 정상 처리
  // - 공제 > 랜드사 몫: 초과분은 여행사 수수료에서 차감, 그래도 초과하면 추가 청구

  const deductionExcess = Math.max(0, approvedDeduction - landcoBase)

  let agencyFinalCommission: number
  let agencyAdditionalCharge: number

  if (deductionExcess === 0) {
    agencyFinalCommission = agencyBase
    agencyAdditionalCharge = 0
  } else if (deductionExcess <= agencyBase) {
    agencyFinalCommission = agencyBase - deductionExcess
    agencyAdditionalCharge = 0
  } else {
    agencyFinalCommission = 0
    agencyAdditionalCharge = deductionExcess - agencyBase
  }

  // 4. 최종 금액
  const landcoFinalPayout = approvedDeduction > 0 ? approvedDeduction : landcoBase

  // 고객 환불 = 결제완료액 - 취소수수료
  // 공제는 취소수수료 내에서 배분되므로 고객 환불에 영향 없음
  // 단, 100% 환불(실비 공제)의 경우: 공제액만큼 환불에서 차감
  let actualCustomerRefund: number
  if (refundRate === 1.0) {
    // 100% 환불: 결제완료액 - 공제액 (음수 = 추가 청구)
    actualCustomerRefund = paidAmount - approvedDeduction
  } else {
    // 50% 또는 0% 환불: 결제완료액 - 취소수수료
    actualCustomerRefund = paidAmount - cancellationFee
    if (agencyAdditionalCharge > 0) {
      actualCustomerRefund = actualCustomerRefund - agencyAdditionalCharge
    }
  }

  return {
    refundRate,
    refundRateLabel,
    policyLabel,
    customerRefundBase,
    cancellationFee,
    landcoBase,
    agencyBase,
    deductionExcess,
    agencyFinalCommission,
    agencyAdditionalCharge,
    customerFinalRefund: actualCustomerRefund,
    landcoFinalPayout,
  }
}
