'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  email: string
  role: 'agency' | 'landco' | 'admin'
  companyName: string
}

const ROLE_LABEL: Record<Props['role'], string> = {
  agency: '여행사',
  landco: '랜드사',
  admin: '관리자',
}

export function AccountMenu({ email, role, companyName }: Props) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center justify-center w-9 h-9 rounded-md border transition-colors duration-150 ${
          open
            ? 'text-blue-600 bg-blue-50 border-blue-200'
            : 'text-gray-500 border-transparent hover:text-gray-800 hover:bg-gray-100 hover:border-gray-200'
        }`}
        aria-label="계정 메뉴"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden" style={{ width: '220px' }}>
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs text-gray-400 mb-0.5">로그인 계정</p>
            <p className="text-sm font-medium text-gray-800 truncate">{email}</p>
          </div>
          <div className="px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">구분</span>
              <span className="text-xs font-medium text-gray-700">{ROLE_LABEL[role]}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">사업자명</span>
              <span className="text-xs font-medium text-gray-700 truncate ml-4 text-right">{companyName}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
