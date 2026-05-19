'use client'

import { useEffect, useState } from 'react'

interface Notice {
  id: string
  title: string
  content: string
  target: 'all' | 'agency' | 'landco'
  pinned: boolean
  published: boolean
  created_at: string
}

const TARGET_LABEL: Record<string, string> = { all: '전체', agency: '여행사', landco: '랜드사' }

export default function AdminNoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [target, setTarget] = useState<'all' | 'agency' | 'landco'>('all')
  const [pinned, setPinned] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load() {
    const res = await fetch('/api/admin/notices')
    if (res.ok) { const { notices: n } = await res.json(); setNotices(n) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setEditId(null)
    setTitle('')
    setContent('')
    setTarget('all')
    setPinned(false)
    setShowForm(true)
  }

  function openEdit(n: Notice) {
    setEditId(n.id)
    setTitle(n.title)
    setContent(n.content)
    setTarget(n.target)
    setPinned(n.pinned)
    setShowForm(true)
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    if (editId) {
      await fetch('/api/admin/notices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, title, content, target, pinned }),
      })
    } else {
      await fetch('/api/admin/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, target, pinned }),
      })
    }
    setSaving(false)
    setShowForm(false)
    load()
  }

  async function handleTogglePublish(n: Notice) {
    await fetch('/api/admin/notices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: n.id, published: !n.published }),
    })
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('이 공지를 삭제하시겠습니까?')) return
    await fetch('/api/admin/notices', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">공지사항 관리</h1>
        <button onClick={openNew} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          + 새 공지 작성
        </button>
      </div>

      {/* 작성/수정 폼 */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6 space-y-4">
          <h3 className="text-sm font-bold text-gray-700">{editId ? '공지 수정' : '새 공지 작성'}</h3>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="제목"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="내용 (선택)"
            rows={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">대상</label>
              <select value={target} onChange={e => setTarget(e.target.value as 'all' | 'agency' | 'landco')} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="all">전체</option>
                <option value="agency">여행사</option>
                <option value="landco">랜드사</option>
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="rounded" />
              <span className="text-xs text-gray-600">상단 고정</span>
            </label>
            <div className="ml-auto flex gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">취소</button>
              <button onClick={handleSave} disabled={saving || !title.trim()} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300">
                {saving ? '저장 중...' : editId ? '수정' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 공지 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {notices.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">등록된 공지가 없습니다.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                <th className="text-left px-4 py-3 font-medium w-12"></th>
                <th className="text-left px-4 py-3 font-medium">제목</th>
                <th className="text-center px-4 py-3 font-medium w-20">대상</th>
                <th className="text-center px-4 py-3 font-medium w-20">상태</th>
                <th className="text-left px-4 py-3 font-medium w-28">등록일</th>
                <th className="text-center px-4 py-3 font-medium w-32">관리</th>
              </tr>
            </thead>
            <tbody>
              {notices.map(n => (
                <tr key={n.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-center">
                    {n.pinned && <span className="text-amber-500" title="고정">&#x1F4CC;</span>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{n.title}</p>
                    {n.content && <p className="text-gray-400 truncate max-w-md mt-0.5">{n.content}</p>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      n.target === 'all' ? 'bg-gray-100 text-gray-600' : n.target === 'agency' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                    }`}>{TARGET_LABEL[n.target]}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleTogglePublish(n)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${n.published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}
                    >
                      {n.published ? '게시중' : '숨김'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{n.created_at?.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => openEdit(n)} className="text-blue-500 hover:text-blue-700">수정</button>
                      <button onClick={() => handleDelete(n.id)} className="text-red-400 hover:text-red-600">삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
