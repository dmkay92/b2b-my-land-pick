import { generateQuoteTemplate } from '@/lib/excel/template'

describe('generateQuoteTemplate', () => {
  it('워크북에 일정표와 견적서 시트가 있어야 함', async () => {
    const workbook = await generateQuoteTemplate({
      event_name: '테스트 행사',
      destination: '일본 오사카',
      depart_date: '2026-06-15',
      return_date: '2026-06-19',
      total_people: 22,
      hotel_grade: 4,
    })
    const sheetNames = workbook.worksheets.map(s => s.name)
    expect(sheetNames).toContain('일정표')
    expect(sheetNames).toContain('견적서')
  })

  it('견적서 시트에 필수 컬럼 헤더가 있어야 함', async () => {
    const workbook = await generateQuoteTemplate({
      event_name: '테스트',
      destination: '태국',
      depart_date: '2026-07-01',
      return_date: '2026-07-05',
      total_people: 10,
      hotel_grade: 5,
    })
    const sheet = workbook.getWorksheet('견적서')!
    const headers = sheet.getRow(3).values as string[]
    expect(headers).toContain('항목')
    expect(headers).toContain('합계')
  })
})
