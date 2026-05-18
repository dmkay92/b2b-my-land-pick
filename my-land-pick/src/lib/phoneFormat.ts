export function formatPhoneByCountry(countryCode: string, raw: string): string {
  const d = raw.replace(/[^0-9]/g, '')
  if (!d) return ''

  switch (countryCode) {
    case '+82': {
      const max = d.slice(0, 11)
      if (max.startsWith('02')) {
        const local = max.slice(2)
        if (local.length <= 3) return `02-${local}`
        if (local.length <= 6) return `02-${local.slice(0, 3)}-${local.slice(3)}`
        const mid = local.length === 7 ? 3 : 4
        return `02-${local.slice(0, mid)}-${local.slice(mid)}`
      }
      const s = max
      if (s.length <= 3) return s
      if (s.length <= 7) return `${s.slice(0, 3)}-${s.slice(3)}`
      return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`
    }
    case '+81': {
      const s = d.slice(0, 11)
      if (s.length <= 3) return s
      if (s.length <= 7) return `${s.slice(0, 3)}-${s.slice(3)}`
      return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`
    }
    case '+86': {
      const s = d.slice(0, 11)
      if (s.length <= 3) return s
      if (s.length <= 7) return `${s.slice(0, 3)}-${s.slice(3)}`
      return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`
    }
    case '+1': {
      const s = d.slice(0, 10)
      if (s.length === 0) return ''
      if (s.length <= 3) return `(${s}`
      if (s.length <= 6) return `(${s.slice(0, 3)}) ${s.slice(3)}`
      return `(${s.slice(0, 3)}) ${s.slice(3, 6)}-${s.slice(6)}`
    }
    case '+66': {
      const s = d.slice(0, 10)
      if (s.length <= 3) return s
      if (s.length <= 6) return `${s.slice(0, 3)}-${s.slice(3)}`
      return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`
    }
    case '+84': {
      const s = d.slice(0, 10)
      if (s.length <= 3) return s
      if (s.length <= 6) return `${s.slice(0, 3)}-${s.slice(3)}`
      return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`
    }
    case '+65':
    case '+852': {
      const s = d.slice(0, 8)
      if (s.length <= 4) return s
      return `${s.slice(0, 4)}-${s.slice(4)}`
    }
    case '+886': {
      const s = d.slice(0, 10)
      if (s.length <= 3) return s
      if (s.length <= 6) return `${s.slice(0, 3)}-${s.slice(3)}`
      return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`
    }
    case '+62': {
      const s = d.slice(0, 11)
      if (s.length <= 4) return s
      if (s.length <= 8) return `${s.slice(0, 4)}-${s.slice(4)}`
      return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`
    }
    case '+60': {
      const s = d.slice(0, 10)
      if (s.length <= 3) return s
      if (s.length <= 6) return `${s.slice(0, 3)}-${s.slice(3)}`
      return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`
    }
    case '+63': {
      const s = d.slice(0, 11)
      if (s.length <= 4) return s
      if (s.length <= 7) return `${s.slice(0, 4)}-${s.slice(4)}`
      return `${s.slice(0, 4)}-${s.slice(4, 7)}-${s.slice(7)}`
    }
    default:
      return d.slice(0, 15)
  }
}
