import Link from 'next/link'

export function Logo() {
  return (
    <div className="fixed top-4 left-6 z-50">
      <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <span className="text-blue-600 font-bold text-lg">마이리얼랜드</span>
        <span className="text-gray-400 text-xs">by</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/myrealtrip-logo.png" alt="Myrealtrip" style={{ height: '16px', width: 'auto' }} />
      </Link>
    </div>
  )
}
