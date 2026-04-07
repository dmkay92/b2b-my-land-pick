'use client'

import { useRouter } from 'next/navigation'

interface BackButtonProps {
  href?: string
}

export function BackButton({ href }: BackButtonProps) {
  const router = useRouter()
  return (
    <button
      onClick={() => href ? router.push(href) : router.back()}
      className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-all px-2.5 py-1.5 rounded-lg mb-4 -ml-2.5"
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:-translate-x-0.5">
        <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      뒤로가기
    </button>
  )
}
