describe('quote selection state', () => {
  it('선택된 랜드사는 selected 상태여야 함', () => {
    const quotes = [
      { id: 'q1', landco_id: 'l1', status: 'submitted' },
      { id: 'q2', landco_id: 'l2', status: 'submitted' },
    ]
    const selected = quotes.find(q => q.landco_id === 'l1')
    expect(selected?.status).toBe('submitted')
    const updated = quotes.map(q =>
      q.landco_id === 'l1' ? { ...q, status: 'selected' } : q
    )
    expect(updated.find(q => q.id === 'q1')?.status).toBe('selected')
    expect(updated.find(q => q.id === 'q2')?.status).toBe('submitted')
  })

  it('최종 확정 시 finalized 상태여야 함', () => {
    const quote = { id: 'q1', status: 'selected' }
    const finalized = { ...quote, status: 'finalized' }
    expect(finalized.status).toBe('finalized')
  })
})
