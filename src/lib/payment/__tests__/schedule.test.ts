import {
  getDefaultTemplateType,
  buildInstallments,
  LARGE_EVENT_THRESHOLD,
} from '../schedule'

describe('getDefaultTemplateType', () => {
  it('returns large_event for 50+ people', () => {
    expect(getDefaultTemplateType(50)).toBe('large_event')
    expect(getDefaultTemplateType(100)).toBe('large_event')
  })

  it('returns standard for under 50 people', () => {
    expect(getDefaultTemplateType(49)).toBe('two_time')
    expect(getDefaultTemplateType(1)).toBe('two_time')
  })
})

describe('buildInstallments', () => {
  const departDate = '2026-06-15'
  const sevenDaysLater = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

  it('builds standard (2-step) installments', () => {
    const result = buildInstallments('two_time', 10000000, departDate)
    expect(result).toHaveLength(2)
    expect(result[0].label).toBe('계약금')
    expect(result[0].rate).toBe(0.1)
    expect(result[0].amount).toBe(1000000)
    expect(result[0].due_date).toBe(sevenDaysLater) // 확정 후 7일 이내
    expect(result[0].allow_split).toBe(false)
    expect(result[1].label).toBe('잔금')
    expect(result[1].rate).toBe(0.9)
    expect(result[1].amount).toBe(9000000)
    expect(result[1].due_date).toBe('2026-06-08')
    expect(result[1].allow_split).toBe(true)
  })

  it('builds large_event (3-step) installments', () => {
    const result = buildInstallments('large_event', 10000000, departDate)
    expect(result).toHaveLength(3)
    expect(result[0].label).toBe('계약금')
    expect(result[0].amount).toBe(1000000)
    expect(result[0].due_date).toBe(sevenDaysLater)
    expect(result[0].allow_split).toBe(false)
    expect(result[1].label).toBe('중도금')
    expect(result[1].rate).toBe(0.4)
    expect(result[1].amount).toBe(4000000)
    expect(result[1].due_date).toBe('2026-05-16')
    expect(result[1].allow_split).toBe(true)
    expect(result[2].label).toBe('잔금')
    expect(result[2].rate).toBe(0.5)
    expect(result[2].amount).toBe(5000000)
    expect(result[2].due_date).toBe('2026-06-08')
    expect(result[2].allow_split).toBe(true)
  })

  it('deposit due_date falls back to today when departure is too close', () => {
    const closeDepartDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
    const result = buildInstallments('two_time', 10000000, closeDepartDate)
    const today = new Date().toISOString().slice(0, 10)
    expect(result[0].due_date).toBe(today)
  })

  it('forces immediate when departure is within 7 days', () => {
    const soonDepartDate = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)
    const result = buildInstallments('two_time', 10000000, soonDepartDate)
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('전액')
    expect(result[0].amount).toBe(10000000)
    expect(result[0].allow_split).toBe(true)
  })

  it('forces immediate for large_event when departure is within 7 days', () => {
    const soonDepartDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    const result = buildInstallments('large_event', 10000000, soonDepartDate)
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('전액')
  })

  it('builds immediate (1-step) installment', () => {
    const result = buildInstallments('one_time', 10000000, departDate)
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('전액')
    expect(result[0].rate).toBe(1.0)
    expect(result[0].amount).toBe(10000000)
    expect(result[0].allow_split).toBe(true)
  })

  it('rounds amounts to integer and remainder goes to last', () => {
    const result = buildInstallments('two_time', 9999999, departDate)
    expect(result[0].amount).toBe(1000000)
    expect(result[1].amount).toBe(8999999)
    expect(result[0].amount + result[1].amount).toBe(9999999)
  })
})
