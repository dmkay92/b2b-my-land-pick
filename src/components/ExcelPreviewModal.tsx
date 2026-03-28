'use client'

import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'

interface SheetData {
  name: string
  rows: string[][]
}

interface Props {
  fileUrl: string
  fileName: string
  onClose: () => void
}

export function ExcelPreviewModal({ fileUrl, fileName, onClose }: Props) {
  const [sheets, setSheets] = useState<SheetData[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(fileUrl)
        if (!res.ok) throw new Error('파일을 불러올 수 없습니다.')
        const buffer = await res.arrayBuffer()
        const wb = XLSX.read(buffer, { type: 'array' })
        const parsed: SheetData[] = wb.SheetNames.map(name => {
          const ws = wb.Sheets[name]
          const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })
          return { name, rows: rows as string[][] }
        })
        setSheets(parsed)
      } catch (e) {
        setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
      }
      setLoading(false)
    }
    load()
  }, [fileUrl])

  const activeRows = sheets[activeSheet]?.rows ?? []
  const headerRow = activeRows[0] ?? []
  const dataRows = activeRows.slice(1)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[92vw] max-w-6xl h-[88vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50 rounded-t-2xl">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-800 text-sm truncate">{fileName}</p>
              {!loading && !error && (
                <p className="text-xs text-gray-400 mt-0.5">{activeRows.length > 0 ? `${dataRows.length}행 · ${headerRow.length}열` : ''}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0 ml-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 시트 탭 */}
        {sheets.length > 1 && (
          <div className="flex gap-1 px-6 pt-3 bg-gray-50 border-b border-gray-100">
            {sheets.map((s, i) => (
              <button
                key={s.name}
                onClick={() => setActiveSheet(i)}
                className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors ${
                  i === activeSheet
                    ? 'bg-white text-blue-600 border border-b-white border-gray-200 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* 컨텐츠 */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-sm">파일 불러오는 중...</p>
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-red-500">
              <svg className="w-10 h-10 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-sm">{error}</p>
            </div>
          )}
          {!loading && !error && sheets[activeSheet] && (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  {headerRow.map((cell, ci) => (
                    <th
                      key={ci}
                      className="bg-gray-50 border-b-2 border-r border-gray-200 px-4 py-2.5 text-left text-xs font-semibold text-gray-600 whitespace-nowrap"
                    >
                      {String(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, ri) => (
                  <tr
                    key={ri}
                    className="hover:bg-blue-50/50 transition-colors"
                  >
                    {headerRow.map((_, ci) => (
                      <td
                        key={ci}
                        className="border-b border-r border-gray-100 px-4 py-2 text-gray-700 whitespace-nowrap max-w-[240px] truncate"
                        title={String(row[ci] ?? '')}
                      >
                        {String(row[ci] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
