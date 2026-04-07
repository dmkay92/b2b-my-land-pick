'use client'

import { ExcelPreviewModal } from './ExcelPreviewModal'

interface Props {
  url: string
  name: string
  onClose: () => void
}

function getFileType(name: string): 'image' | 'pdf' | 'excel' | 'other' {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (['xlsx', 'xls'].includes(ext)) return 'excel'
  return 'other'
}

export function AttachmentPreviewModal({ url, name, onClose }: Props) {
  const type = getFileType(name)

  if (type === 'excel') {
    return <ExcelPreviewModal fileUrl={url} fileName={name} onClose={onClose} />
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[92vw] max-w-4xl h-[88vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50 rounded-t-2xl shrink-0">
          <p className="font-semibold text-gray-800 text-sm truncate">{name}</p>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={async () => {
                const res = await fetch(url)
                const blob = await res.blob()
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = name
                a.click()
                URL.revokeObjectURL(a.href)
              }}
              className="text-xs text-gray-500 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              ↓ 다운로드
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 컨텐츠 */}
        <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-100">
          {type === 'image' && (
            <img
              src={url}
              alt={name}
              className="max-w-full max-h-full object-contain p-4"
            />
          )}
          {type === 'pdf' && (
            <iframe
              src={url}
              className="w-full h-full border-0"
              title={name}
            />
          )}
          {type === 'other' && (
            <div className="flex flex-col items-center gap-3 text-gray-400 p-8 text-center">
              <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">이 파일 형식은 미리보기를 지원하지 않습니다.</p>
              <button
                onClick={async () => {
                  const res = await fetch(url)
                  const blob = await res.blob()
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = name
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
                className="text-sm text-[#009CF0] border border-[#009CF0] px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors"
              >
                ↓ 다운로드
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
