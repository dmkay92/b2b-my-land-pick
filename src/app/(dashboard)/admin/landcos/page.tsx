'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, AdminActionLog } from '@/lib/supabase/types'
import { BackButton } from '@/components/BackButton'
import { getCountryName } from '@/lib/utils'

type Status = 'approved' | 'rejected' | 'pending'

const COUNTRY_OPTIONS = [
  { code: 'JP', name: '일본' },
  { code: 'CN', name: '중국' },
  { code: 'VN', name: '베트남' },
  { code: 'FR', name: '프랑스' },
]

const STATUS_STYLE: Record<Status, string> = {
  approved: 'bg-green-100 text-green-700',
  pending:  'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-600',
}
const STATUS_LABEL: Record<Status, string> = {
  approved: '승인', pending: '대기', rejected: '정지',
}

function formatLogDetail(log: AdminActionLog): string {
  const d = log.detail
  if (log.action_type === 'status_change') {
    const from = STATUS_LABEL[(d.from as Status) ?? 'pending'] ?? d.from
    const to = STATUS_LABEL[d.to as Status] ?? d.to
    return `상태 변경: ${from} → ${to}`
  }
  if (log.action_type === 'email_change') {
    return `이메일 변경: ${d.from} → ${d.to}`
  }
  if (log.action_type === 'country_change') {
    const from = ((d.from as string[]) ?? []).map(getCountryName).join(', ') || '미지정'
    const to = ((d.to as string[]) ?? []).map(getCountryName).join(', ') || '미지정'
    return `담당 국가 변경: ${from} → ${to}`
  }
  return ''
}

function formatLogDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }) +
    ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

export default function LandcosPage() {
  const supabase = createClient()
  const [landcos, setLandcos] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Profile | null>(null)
  const [editStatus, setEditStatus] = useState<Status>('approved')
  const [editEmail, setEditEmail] = useState('')
  const [editingEmail, setEditingEmail] = useState(false)
  const [editCodes, setEditCodes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<Status | null>(null)
  const [logs, setLogs] = useState<AdminActionLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('role', 'landco')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setLandcos(data ?? [])
        setLoading(false)
      })
  }, [])

  async function openModal(landco: Profile) {
    setSelected(landco)
    setEditStatus(landco.status as Status)
    setEditEmail(landco.email)
    setEditingEmail(false)
    setEditCodes(landco.country_codes ?? [])
    setLogs([])
    setLogsLoading(true)
    const res = await fetch(`/api/admin/action-logs?userId=${landco.id}`)
    if (res.ok) setLogs(await res.json())
    setLogsLoading(false)
  }

  function toggleCode(code: string) {
    setEditCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  function handleStatusClick(s: Status) {
    if (s !== editStatus) {
      setPendingStatus(s)
    }
  }

  function confirmStatusChange() {
    if (!pendingStatus) return
    setEditStatus(pendingStatus)
    setPendingStatus(null)
  }

  async function handleSave() {
    if (!selected) return
    const statusChanged = editStatus !== (selected.status as Status)
    const emailChanged = editEmail !== selected.email
    const codesChanged = JSON.stringify([...editCodes].sort()) !== JSON.stringify([...(selected.country_codes ?? [])].sort())
    if (!statusChanged && !emailChanged && !codesChanged) { setSelected(null); return }
    setSaving(true)
    await Promise.all([
      statusChanged && fetch('/api/admin/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selected.id, status: editStatus }),
      }),
      emailChanged && fetch('/api/admin/profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selected.id, email: editEmail }),
      }),
      codesChanged && fetch('/api/admin/assign-countries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landcoId: selected.id, countryCodes: editCodes }),
      }),
    ])
    setSaving(false)
    const approved_at = editStatus === 'approved' ? new Date().toISOString() : selected.approved_at
    setLandcos(prev => prev.map(l => l.id === selected.id ? { ...l, status: editStatus, email: editEmail, country_codes: editCodes, approved_at } : l))
    setSelected(null)
  }

  if (loading) return <div className="p-8 text-gray-500">로딩 중...</div>

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <BackButton href="/admin" />
      <h1 className="text-2xl font-bold mb-6">랜드사 리스트 <span className="text-gray-400 font-normal text-lg">({landcos.length})</span></h1>
      {landcos.length === 0 ? (
        <p className="text-gray-400">등록된 랜드사가 없습니다.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">랜드사 ID</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">회사명</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">이메일</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">상태</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">담당 국가</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">가입일</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">최초승인일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {landcos.map((landco, i) => (
                <tr
                  key={landco.id}
                  onClick={() => openModal(landco)}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-3 font-mono text-sm text-gray-600">{'L' + String(i + 1).padStart(5, '0')}</td>
                  <td className="px-5 py-3 font-medium text-gray-800">{landco.company_name}</td>
                  <td className="px-5 py-3 text-gray-500">{landco.email}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[landco.status as Status]}`}>
                      {STATUS_LABEL[landco.status as Status]}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(landco.country_codes ?? []).length > 0
                        ? (landco.country_codes ?? []).map(code => (
                            <span key={code} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                              {getCountryName(code)}
                            </span>
                          ))
                        : <span className="text-gray-300 text-xs">미지정</span>
                      }
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-400">
                    {new Date(landco.created_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                  </td>
                  <td className="px-5 py-3 text-gray-400">
                    {landco.approved_at ? new Date(landco.approved_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 상태 변경 확인 팝업 */}
      {pendingStatus && selected && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40" onKeyDown={(e) => e.key === 'Escape' && setPendingStatus(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs">
            <h3 className="text-base font-bold mb-2">상태 변경 확인</h3>
            <p className="text-sm text-gray-500 mb-6">
              <span className="font-medium text-gray-800">{selected.company_name}</span>의 상태를{' '}
              <span className="font-semibold">{STATUS_LABEL[pendingStatus]}</span>으로 변경하시겠습니까?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPendingStatus(null)} className="flex-1 py-2 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50">취소</button>
              <button autoFocus onClick={confirmStatusChange} disabled={saving} className="flex-1 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? '저장 중...' : '확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상세 팝업 */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-4">{selected.company_name}</h3>

            {/* 기본 정보 */}
            <div className="space-y-2 mb-5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 w-16 flex-shrink-0">이메일</span>
                {editingEmail ? (
                  <>
                    <input
                      autoFocus
                      value={editEmail}
                      onChange={e => setEditEmail(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
                    />
                    <button onClick={() => { setEditEmail(selected.email); setEditingEmail(false) }} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">취소</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-gray-600">{editEmail}</span>
                    <button onClick={() => setEditingEmail(true)} className="text-xs text-blue-500 hover:text-blue-700 flex-shrink-0">수정</button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 w-16 flex-shrink-0">가입일</span>
                <span className="text-gray-600">{new Date(selected.created_at).toLocaleDateString('ko-KR')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 w-16 flex-shrink-0">최초승인일</span>
                <span className="text-gray-600">{selected.approved_at ? new Date(selected.approved_at).toLocaleDateString('ko-KR') : '-'}</span>
              </div>
              {logs.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 w-16 flex-shrink-0">최종수정일</span>
                  <span className="text-gray-600">{formatLogDate(logs[0].created_at)}</span>
                </div>
              )}
            </div>

            {/* 상태 변경 */}
            <p className="text-sm font-medium text-gray-700 mb-2">상태 변경</p>
            <div className="flex gap-2 mb-5">
              {(['approved', 'rejected'] as Status[]).map(s => (
                <button
                  key={s}
                  onClick={() => handleStatusClick(s)}
                  className={`flex-1 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    editStatus === s
                      ? STATUS_STYLE[s] + ' border-transparent'
                      : s === 'rejected'
                        ? 'text-gray-400 border-gray-200 hover:bg-red-50 hover:text-red-400 hover:border-red-200'
                        : 'text-gray-400 border-gray-200 hover:bg-green-50 hover:text-green-600 hover:border-green-200'
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>

            {/* 담당 국가 */}
            <p className="text-sm font-medium text-gray-700 mb-2">담당 국가</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {COUNTRY_OPTIONS.map(country => (
                <button
                  key={country.code}
                  onClick={() => toggleCode(country.code)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    editCodes.includes(country.code)
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {country.name}
                </button>
              ))}
            </div>

            {/* 서류 다운로드 */}
            {(selected.document_biz_url || selected.document_bank_url) && (
              <div className="mb-5">
                <p className="text-sm font-medium text-gray-700 mb-2">서류 다운로드</p>
                <div className="flex gap-2">
                  {selected.document_biz_url && (
                    <button
                      onClick={async () => {
                        const { data } = await supabase.storage
                          .from('signup-documents')
                          .createSignedUrl(selected.document_biz_url!, 3600)
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                      }}
                      className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      📄 사업자등록증
                    </button>
                  )}
                  {selected.document_bank_url && (
                    <button
                      onClick={async () => {
                        const { data } = await supabase.storage
                          .from('signup-documents')
                          .createSignedUrl(selected.document_bank_url!, 3600)
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                      }}
                      className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      🏦 통장사본
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 액션 로그 */}
            <p className="text-sm font-medium text-gray-700 mb-2">액션 로그</p>
            <div className="h-48 overflow-y-auto rounded-lg bg-gray-50 px-3 py-2 mb-5">
              {logsLoading ? (
                <p className="text-xs text-gray-400 py-2">로딩 중...</p>
              ) : logs.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">기록된 액션이 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {logs.map(log => (
                    <li key={log.id} className="flex gap-3 text-xs">
                      <span className="text-gray-400 flex-shrink-0 w-32">{formatLogDate(log.created_at)}</span>
                      <span className="text-gray-700">{formatLogDetail(log)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setSelected(null)} className="flex-1 py-2 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50">취소</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
