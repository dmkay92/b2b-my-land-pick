/**
 * 정산 계산 유틸
 *
 * 정상 완료: 견적가 - 플랫폼 수수료(5%)
 * 7일 이전 취소: 플랫폼 수수료 0, 공제 전액 랜드사 지급
 * 1~6일 전 취소: 견적가×50% - 플랫폼 수수료(견적가×50%×5%), 공제 초과 시 충당
 * 당일/노쇼: 정상 완료와 동일
 */

export interface SettlementCalcInput {
  landcoQuoteTotal: number
  agencyCommission: number
  totalCustomerPrice: number
  paidAmount: number
  approvedDeduction: number
  isCancelled: boolean
  daysUntilDepart: number // 취소 시점 기준 (취소 안 된 건은 무시)
}

export interface SettlementCalcResult {
  // 환불 관련
  refundRate: number
  refundRateLabel: string

  // 랜드사
  landcoBase: number           // 랜드사 기본 보유액 (수수료 차감 전)
  platformFee: number          // 플랫폼 수수료
  landcoPayout: number         // 랜드사 최종 지급액

  // 여행사
  agencyBase: number           // 여행사 기본 수수료
  agencyPayout: number         // 여행사 최종 수수료
  agencyAdditionalCharge: number // 여행사 추가 청구

  // 플랫폼
  platformRevenue: number      // 플랫폼 최종 수익

  // 고객
  customerRefund: number       // 고객 환불액
}

export function calculateSettlement(input: SettlementCalcInput): SettlementCalcResult {
  const { landcoQuoteTotal, agencyCommission, paidAmount, approvedDeduction, isCancelled, daysUntilDepart } = input

  // 정상 완료 또는 당일/노쇼
  if (!isCancelled || daysUntilDepart <= 0) {
    const platformFee = Math.round(landcoQuoteTotal * 0.05)
    return {
      refundRate: isCancelled ? 0 : 1,
      refundRateLabel: isCancelled ? '0% (당일/노쇼)' : '해당없음',
      landcoBase: landcoQuoteTotal,
      platformFee,
      landcoPayout: landcoQuoteTotal - platformFee,
      agencyBase: agencyCommission,
      agencyPayout: agencyCommission,
      agencyAdditionalCharge: 0,
      platformRevenue: platformFee,
      customerRefund: 0,
    }
  }

  // 7일 이전 취소 (100% 환불)
  if (daysUntilDepart >= 7) {
    const landcoPayout = approvedDeduction // 공제 전액 지급
    const customerRefund = paidAmount - approvedDeduction

    return {
      refundRate: 1,
      refundRateLabel: '100% (7일 이전)',
      landcoBase: 0,
      platformFee: 0,
      landcoPayout,
      agencyBase: 0,
      agencyPayout: 0,
      agencyAdditionalCharge: customerRefund < 0 ? Math.abs(customerRefund) : 0,
      platformRevenue: 0,
      customerRefund: Math.max(0, customerRefund),
    }
  }

  // 1~6일 전 취소 (50% 환불)
  const landcoHalf = Math.round(landcoQuoteTotal * 0.5)
  const platformFee = Math.round(landcoHalf * 0.05)
  const landcoBase = landcoHalf - platformFee
  const agencyBase = Math.round(agencyCommission * 0.5)

  // 공제가 랜드사 기본 이하
  if (approvedDeduction <= landcoBase) {
    const customerRefund = paidAmount - (landcoBase + agencyBase + platformFee)
    return {
      refundRate: 0.5,
      refundRateLabel: '50% (1~6일 전)',
      landcoBase: landcoHalf,
      platformFee,
      landcoPayout: landcoBase,
      agencyBase,
      agencyPayout: agencyBase,
      agencyAdditionalCharge: 0,
      platformRevenue: platformFee,
      customerRefund: Math.max(0, customerRefund),
    }
  }

  // 공제 > 랜드사 기본: 초과분 충당
  const excess = approvedDeduction - landcoBase
  let remainingExcess = excess
  let finalAgency = agencyBase
  let finalPlatform = platformFee

  // 1. 여행사 수수료에서 차감
  if (remainingExcess > 0 && finalAgency > 0) {
    const deduct = Math.min(remainingExcess, finalAgency)
    finalAgency -= deduct
    remainingExcess -= deduct
  }

  // 2. 플랫폼 수수료에서 차감
  if (remainingExcess > 0 && finalPlatform > 0) {
    const deduct = Math.min(remainingExcess, finalPlatform)
    finalPlatform -= deduct
    remainingExcess -= deduct
  }

  // 3. 나머지는 여행사 추가 청구
  const agencyAdditionalCharge = remainingExcess

  return {
    refundRate: 0.5,
    refundRateLabel: '50% (1~6일 전)',
    landcoBase: landcoHalf,
    platformFee: finalPlatform,
    landcoPayout: approvedDeduction, // 공제 전액 지급
    agencyBase,
    agencyPayout: finalAgency,
    agencyAdditionalCharge,
    platformRevenue: finalPlatform,
    customerRefund: 0, // 50% 취소에서 공제 초과 시 환불 없음
  }
}
