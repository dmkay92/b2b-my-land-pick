'use client'

import { useState, useRef } from 'react'

interface Props {
  files: File[]
  onChange: (files: File[]) => void
  required?: boolean
}

export default function FileDropZone({ files, onChange, required = false }: Props) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length > 0) onChange([...files, ...dropped])
  }

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    if (selected.length > 0) onChange([...files, ...selected])
    e.target.value = ''
  }

  function removeFile(idx: number) {
    onChange(files.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <label className="text-xs font-medium text-gray-600 mb-1 block">첨부파일 {required ? <span className="text-red-500">(필수)</span> : '(선택)'}</label>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg px-4 py-3 text-center cursor-pointer transition-colors ${
          dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
        }`}
      >
        <input ref={inputRef} type="file" multiple onChange={handleSelect} className="hidden" />
        <p className="text-xs text-gray-400">
          {dragging ? '여기에 놓으세요' : '클릭 또는 파일을 드래그하세요'}
        </p>
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5 rounded">
              {f.name}
              <button onClick={(e) => { e.stopPropagation(); removeFile(i) }} className="text-gray-400 hover:text-red-500">&times;</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
