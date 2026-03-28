import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '마이리얼랜드',
  description: '여행사와 랜드사를 위한 견적 협업 플랫폼',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
