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

  // Collect non-meal rows with their totals
  const nonMealRows: { cat: PricingCategory; rowIdx: number; total: number; divisor: number }[] = []
  let nonMealSum = 0
  for (const cat of nonMealCategories) {
    pricing[cat].forEach((row, rowIdx) => {
      const rt = rowTotal(row)
      const divisor = row.count * row.quantity
      if (rt > 0 && divisor > 0) {
        nonMealRows.push({ cat, rowIdx, total: rt, divisor })
        nonMealSum += rt
      }
    })
  }

  if (nonMealSum === 0) return pricing

  // Deep clone
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

  // Strategy: calculate target row total (not price), then back-calculate price
  // This avoids rounding errors from dividing then multiplying
  let remainingMarkup = totalMarkup
  for (let i = 0; i < nonMealRows.length; i++) {
    const { cat, rowIdx, total, divisor } = nonMealRows[i]
    const row = result[cat][rowIdx]
    const isLast = i === nonMealRows.length - 1

    // Target markup for this row's total
    const rowMarkup = isLast
      ? remainingMarkup
      : Math.round(totalMarkup * (total / nonMealSum))

    // Target new total for this row
    const targetRowTotal = total + rowMarkup

    // Back-calculate price: price = targetRowTotal / divisor
    // Use floor for non-last, adjust last row to absorb remainder
    row.price = Math.floor(targetRowTotal / divisor)

    // Track actual markup applied (may differ due to floor)
    const actualNewTotal = row.price * divisor
    remainingMarkup -= (actualNewTotal - total)
  }

  // Final correction: add remaining to last row's price
  if (remainingMarkup !== 0 && nonMealRows.length > 0) {
    const last = nonMealRows[nonMealRows.length - 1]
    result[last.cat][last.rowIdx].price += remainingMarkup / last.divisor

    // If not evenly divisible, round and accept (should be 0-1 won difference max)
    if (!Number.isInteger(result[last.cat][last.rowIdx].price)) {
      result[last.cat][last.rowIdx].price = Math.round(result[last.cat][last.rowIdx].price)
    }
  }

  return result
}
