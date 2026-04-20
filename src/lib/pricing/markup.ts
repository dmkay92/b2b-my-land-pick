import type { PricingData, PricingRow } from '@/lib/supabase/types'

const PRICING_CATEGORIES = ['호텔', '차량', '식사', '입장료', '가이드비용', '기타'] as const
type PricingCategory = typeof PRICING_CATEGORIES[number]

function rowTotal(row: PricingRow): number {
  return row.price * row.count * row.quantity
}

export function calculatePricingTotals(pricing: PricingData): {
  total: number
  categoryTotals: Record<string, number>
} {
  const categoryTotals: Record<string, number> = {}
  let total = 0
  for (const cat of PRICING_CATEGORIES) {
    const catTotal = pricing[cat].reduce((sum, row) => sum + rowTotal(row), 0)
    categoryTotals[cat] = catTotal
    total += catTotal
  }
  return { total, categoryTotals }
}

export function applyPlatformMargin(pricing: PricingData, marginRate: number): PricingData {
  const result: PricingData = { ...pricing }
  for (const cat of PRICING_CATEGORIES) {
    result[cat] = pricing[cat].map(row => ({
      ...row,
      price: Math.round(row.price * (1 + marginRate)),
    }))
  }
  if (pricing.currencies) result.currencies = { ...pricing.currencies }
  if (pricing.exchangeRates) result.exchangeRates = { ...pricing.exchangeRates }
  return result
}

export function distributeMealExcludedMarkup(
  pricing: PricingData,
  totalMarkup: number,
): PricingData {
  if (totalMarkup === 0) return pricing

  const nonMealCategories = PRICING_CATEGORIES.filter(c => c !== '식사')

  const nonMealRowTotals: { cat: PricingCategory; rowIdx: number; total: number }[] = []
  let nonMealSum = 0
  for (const cat of nonMealCategories) {
    pricing[cat].forEach((row, rowIdx) => {
      const rt = rowTotal(row)
      if (rt > 0) {
        nonMealRowTotals.push({ cat, rowIdx, total: rt })
        nonMealSum += rt
      }
    })
  }

  if (nonMealSum === 0) return pricing

  const result: PricingData = {
    호텔: pricing['호텔'].map(r => ({ ...r })),
    차량: pricing['차량'].map(r => ({ ...r })),
    식사: pricing['식사'].map(r => ({ ...r })),
    입장료: pricing['입장료'].map(r => ({ ...r })),
    가이드비용: pricing['가이드비용'].map(r => ({ ...r })),
    기타: pricing['기타'].map(r => ({ ...r })),
  }
  if (pricing.currencies) result.currencies = { ...pricing.currencies }
  if (pricing.exchangeRates) result.exchangeRates = { ...pricing.exchangeRates }

  let distributed = 0
  for (let i = 0; i < nonMealRowTotals.length; i++) {
    const { cat, rowIdx, total } = nonMealRowTotals[i]
    const row = result[cat][rowIdx]
    const isLast = i === nonMealRowTotals.length - 1

    const rowMarkup = isLast
      ? totalMarkup - distributed
      : Math.round(totalMarkup * (total / nonMealSum))

    const divisor = row.count * row.quantity
    if (divisor > 0) {
      row.price = row.price + Math.round(rowMarkup / divisor)
      const actualRowMarkup = rowTotal(row) - total
      distributed += actualRowMarkup
    }
  }

  // Final rounding correction
  const newTotal = calculatePricingTotals(result).total
  const originalTotal = calculatePricingTotals(pricing).total
  const diff = (originalTotal + totalMarkup) - newTotal
  if (diff !== 0 && nonMealRowTotals.length > 0) {
    const last = nonMealRowTotals[nonMealRowTotals.length - 1]
    const lastRow = result[last.cat][last.rowIdx]
    const divisor = lastRow.count * lastRow.quantity
    if (divisor > 0) {
      lastRow.price += Math.round(diff / divisor)
    }
  }

  return result
}
