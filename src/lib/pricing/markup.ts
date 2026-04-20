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

  // Distribute markup to each row's price, track remainder precisely
  let remainingMarkup = totalMarkup
  for (let i = 0; i < nonMealRows.length; i++) {
    const { cat, rowIdx, total, divisor } = nonMealRows[i]
    const row = result[cat][rowIdx]

    // How much markup this row should absorb (proportional)
    const rowMarkup = i === nonMealRows.length - 1
      ? remainingMarkup
      : Math.round(totalMarkup * (total / nonMealSum))

    // Add to price, floored so we don't overshoot
    const priceAdd = Math.floor(rowMarkup / divisor)
    row.price += priceAdd

    // Track what was actually distributed at row-total level
    remainingMarkup -= priceAdd * divisor
  }

  // Remaining is a small integer (< sum of all divisors).
  // Add it as a separate 1-unit row in the largest non-meal category to be exact.
  if (remainingMarkup > 0 && nonMealRows.length > 0) {
    // Find the category with the largest total to hide the adjustment naturally
    const largestCat = nonMealRows.reduce((a, b) => a.total > b.total ? a : b).cat
    result[largestCat].push({
      date: '',
      detail: '',
      price: remainingMarkup,
      count: 1,
      quantity: 1,
    })
  }

  return result
}
