'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  companyName: string
  role: 'agency' | 'landco' | 'admin'
  rightSlot: React.ReactNode
  children: React.ReactNode
}

const NAV_ITEMS: Record<'agency' | 'landco' | 'admin', { label: string; href: string; icon: string }[]> = {
  agency: [
    { label: '대시보드', href: '/agency', icon: '🏠' },
    { label: '새 견적 요청', href: '/agency/requests/new', icon: '✏️' },
  ],
  landco: [
    { label: '대시보드', href: '/landco', icon: '🏠' },
    { label: '내 견적서', href: '/landco/quotes', icon: '✏️' },
    { label: '담당 국가', href: '/landco/countries', icon: '🌏' },
  ],
  admin: [
    { label: '관리자 대시보드', href: '/admin', icon: '🛠️' },
    { label: '여행사 리스트', href: '/admin/agencies', icon: '🏢' },
    { label: '랜드사 리스트', href: '/admin/landcos', icon: '🌏' },
  ],
}

export function AgencySidebar({ companyName, role, rightSlot, children }: Props) {
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const pathname = usePathname()
  const open = pinned || hovered
  const sidebarWidth = open ? 260 : 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 헤더 */}
      <header className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-100 flex items-center justify-between px-4 h-14" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPinned(v => !v)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="text-gray-500 hover:text-gray-900 w-9 h-9 flex items-center justify-center rounded hover:bg-gray-100 transition-colors duration-150"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <Link href={role === 'agency' ? '/agency' : role === 'landco' ? '/landco' : '/admin'} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
            <span className="text-lg font-bold text-gray-900">마이랜드픽</span>
            <span className="text-gray-400 text-xs">by</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/myrealtrip-logo.png" alt="Myrealtrip" style={{ height: '16px', width: 'auto' }} />
          </Link>
        </div>
        <div className="flex items-center gap-3">{rightSlot}</div>
      </header>

      {/* 사이드바 */}
      <aside
        className="fixed top-14 left-0 bottom-0 z-20 bg-white flex flex-col overflow-hidden transition-all duration-200"
        style={{ width: sidebarWidth, boxShadow: open ? '2px 0 8px rgba(0,0,0,0.06)' : 'none' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* 회사 정보 */}
        <div className="px-4 py-4 border-b border-gray-100 whitespace-nowrap">
          <p className="text-xs text-gray-400 mb-0.5">
            {role === 'agency' ? '여행사' : role === 'landco' ? '랜드사' : '관리자'}
          </p>
          <p className="text-sm font-semibold text-gray-800 truncate">{companyName}</p>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 py-4 overflow-y-auto space-y-1">
          {NAV_ITEMS[role].map(item => {
            const isActive = item.href === '/landco' || item.href === '/agency' || item.href === '/admin'
            ? pathname === item.href
            : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-5 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#E8F6FE] text-[#009CF0] border-r-2 border-[#009CF0]'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* 메인 콘텐츠 */}
      <div
        className="transition-all duration-200"
        style={{ paddingTop: '56px', paddingLeft: sidebarWidth }}
      >
        {children}
      </div>
    </div>
  )
}
