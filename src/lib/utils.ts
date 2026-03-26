export interface PeopleCount {
  adults: number
  children: number
  infants: number
  leaders: number
}

export function calculateTotalPeople(people: PeopleCount): number {
  return people.adults + people.children + people.infants + people.leaders
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function hotelGradeLabel(grade: number): string {
  return `${grade}성급`
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: '견적 접수 중',
    in_progress: '협업 진행 중',
    closed: '마감',
    finalized: '최종 확정',
    pending: '승인 대기',
    approved: '승인됨',
    rejected: '거절됨',
    submitted: '제출됨',
    selected: '선택됨',
  }
  return labels[status] ?? status
}
