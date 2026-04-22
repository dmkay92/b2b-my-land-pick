import {
  applyPlatformMargin,
  distributeMealExcludedMarkup,
  calculatePricingTotals,
} from '../markup'
import type { PricingData } from '@/lib/supabase/types'

const basePricing: PricingData = {
  호텔: [{ date: 'Day1', detail: '호텔A', price: 100000, count: 2, quantity: 1 }],
  차량: [{ date: 'Day1', detail: '버스', price: 50000, count: 1, quantity: 1 }],
  식사: [{ date: 'Day1', detail: '중식', price: 30000, count: 1, quantity: 1 }],
  입장료: [{ date: 'Day1', detail: '입장', price: 10000, count: 1, quantity: 1 }],
  가이드비용: [{ date: 'Day1', detail: '가이드', price: 10000, count: 1, quantity: 1 }],
  기타: [],
}

describe('calculatePricingTotals', () => {
  it('calculates total from all categories', () => {
    const result = calculatePricingTotals(basePricing)
    // 호텔: 100000*2*1=200000, 차량: 50000, 식사: 30000, 입장료: 10000, 가이드: 10000
    expect(result.total).toBe(300000)
    expect(result.categoryTotals['호텔']).toBe(200000)
    expect(result.categoryTotals['식사']).toBe(30000)
  })
})

describe('applyPlatformMargin', () => {
  it('applies margin rate to pricing rows', () => {
    const result = applyPlatformMargin(basePricing, 0.05)
    // 호텔 price: 100000 * 1.05 = 105000
    expect(result['호텔'][0].price).toBe(105000)
    expect(result['식사'][0].price).toBe(31500)
    expect(result['차량'][0].price).toBe(52500)
  })
})

describe('distributeMealExcludedMarkup', () => {
  it('distributes markup proportionally excluding 식사', () => {
    const totalMarkup = 100000
    const result = distributeMealExcludedMarkup(basePricing, totalMarkup)
    expect(result['식사'][0].price).toBe(30000) // unchanged
    const originalTotal = 300000
    const newTotals = calculatePricingTotals(result)
    // 100원 단위 반올림으로 약간의 차이 허용 (±1000원 이내)
    expect(Math.abs(newTotals.total - (originalTotal + totalMarkup))).toBeLessThan(1000)
    // 모든 non-meal price가 100원 단위인지 확인
    expect(result['호텔'][0].price % 100).toBe(0)
    expect(result['차량'][0].price % 100).toBe(0)
  })

  it('handles zero markup', () => {
    const result = distributeMealExcludedMarkup(basePricing, 0)
    expect(result['호텔'][0].price).toBe(basePricing['호텔'][0].price)
  })

  it('handles rounding - total within tolerance', () => {
    const result = distributeMealExcludedMarkup(basePricing, 33333)
    const newTotals = calculatePricingTotals(result)
    expect(Math.abs(newTotals.total - (300000 + 33333))).toBeLessThan(1000)
  })

  it('handles empty non-meal categories gracefully', () => {
    const emptyPricing: PricingData = {
      호텔: [],
      차량: [],
      식사: [{ date: 'Day1', detail: '중식', price: 30000, count: 1, quantity: 1 }],
      입장료: [],
      가이드비용: [],
      기타: [],
    }
    const result = distributeMealExcludedMarkup(emptyPricing, 10000)
    const totals = calculatePricingTotals(result)
    expect(totals.total).toBe(30000) // unchanged, markup cannot be applied
  })
})
