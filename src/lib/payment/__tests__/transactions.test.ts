import {
  validateTransaction,
  calculateInstallmentStatus,
} from '../transactions'

describe('validateTransaction', () => {
  it('allows transaction on split-enabled installment', () => {
    const result = validateTransaction({
      allow_split: true, amount: 1000000, paid_amount: 500000,
      status: 'partial', existingTxCount: 1,
    }, 300000)
    expect(result.valid).toBe(true)
  })

  it('blocks second transaction on non-split installment', () => {
    const result = validateTransaction({
      allow_split: false, amount: 1000000, paid_amount: 0,
      status: 'pending', existingTxCount: 1,
    }, 1000000)
    expect(result.valid).toBe(false)
  })

  it('allows first transaction on non-split installment', () => {
    const result = validateTransaction({
      allow_split: false, amount: 1000000, paid_amount: 0,
      status: 'pending', existingTxCount: 0,
    }, 1000000)
    expect(result.valid).toBe(true)
  })

  it('blocks transaction exceeding remaining amount', () => {
    const result = validateTransaction({
      allow_split: true, amount: 1000000, paid_amount: 800000,
      status: 'partial', existingTxCount: 1,
    }, 300000)
    expect(result.valid).toBe(false)
  })

  it('blocks transaction on paid installment', () => {
    const result = validateTransaction({
      allow_split: true, amount: 1000000, paid_amount: 1000000,
      status: 'paid', existingTxCount: 2,
    }, 100000)
    expect(result.valid).toBe(false)
  })
})

describe('calculateInstallmentStatus', () => {
  it('returns paid when fully paid', () => {
    expect(calculateInstallmentStatus(1000000, 1000000)).toBe('paid')
  })
  it('returns partial when partially paid', () => {
    expect(calculateInstallmentStatus(1000000, 500000)).toBe('partial')
  })
  it('returns pending when nothing paid', () => {
    expect(calculateInstallmentStatus(1000000, 0)).toBe('pending')
  })
})
