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
    expect(getDefaultTemplateType(49)).toBe('standard')
    expect(getDefaultTemplateType(1)).toBe('standard')
  })
})

describe('buildInstallments', () => {
  const departDate = '2026-06-15'

  it('builds standard (2-step) installments', () => {
    const result = buildInstallments('standard', 10000000, departDate)
    expect(result).toHaveLength(2)
    expect(result[0].label).toBe('계약금')
    expect(result[0].rate).toBe(0.1)
    expect(result[0].amount).toBe(1000000)
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

  it('builds immediate (1-step) installment', () => {
    const result = buildInstallments('immediate', 10000000, departDate)
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('전액')
    expect(result[0].rate).toBe(1.0)
    expect(result[0].amount).toBe(10000000)
    expect(result[0].allow_split).toBe(true)
  })

  it('rounds amounts to integer and remainder goes to last', () => {
    const result = buildInstallments('standard', 9999999, departDate)
    expect(result[0].amount).toBe(1000000)
    expect(result[1].amount).toBe(8999999)
    expect(result[0].amount + result[1].amount).toBe(9999999)
  })
})
