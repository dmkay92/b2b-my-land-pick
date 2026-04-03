'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, AdminActionLog } from '@/lib/supabase/types'
import { BackButton } from '@/components/BackButton'

type Status = 'approved' | 'rejected' | 'pending'

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
  return ''
}

function formatLogDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }) +
    ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

type SortKey = 'company_name' | 'email' | 'status' | 'created_at' | 'approved_at'

function sortProfiles(list: Profile[], key: SortKey, dir: 'asc' | 'desc'): Profile[] {
  return [...list].sort((a, b) => {
    const av = a[key] ?? ''
    const bv = b[key] ?? ''
    const cmp = String(av).localeCompare(String(bv), 'ko', { numeric: true })
    return dir === 'asc' ? cmp : -cmp
  })
}

function SortTh({ label, sortKey, current, dir, onSort }: {
  label: string
  sortKey: SortKey
  current: SortKey
  dir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
}) {
  const active = current === sortKey
  return (
    <th className="text-left px-5 py-3 text-gray-500 font-medium">
      <button
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 hover:text-gray-800 transition-colors"
      >
        {label}
        <span className={`text-xs ${active ? 'text-blue-500' : 'text-gray-300'}`}>
          {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

export default function AgenciesPage() {
  const supabase = createClient()
  const [agencies, setAgencies] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected] = useState<Profile | null>(null)
  const [editStatus, setEditStatus] = useState<Status>('approved')
  const [editEmail, setEditEmail] = useState('')
  const [editingEmail, setEditingEmail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<Status | null>(null)
  const [logs, setLogs] = useState<AdminActionLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = sortProfiles(agencies, sortKey, sortDir)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('role', 'agency')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setAgencies(data ?? [])
        setLoading(false)
      })
  }, [])

  async function openModal(agency: Profile) {
    setSelected(agency)
    setEditStatus(agency.status as Status)
    setEditEmail(agency.email)
    setEditingEmail(false)
    setLogs([])
    setLogsLoading(true)
    const res = await fetch(`/api/admin/action-logs?userId=${agency.id}`)
    if (res.ok) setLogs(await res.json())
    setLogsLoading(false)
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
    if (!statusChanged && !emailChanged) { setSelected(null); return }
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
    ])
    setSaving(false)
    const approved_at = editStatus === 'approved' ? new Date().toISOString() : selected.approved_at
    setAgencies(prev => prev.map(a => a.id === selected.id ? { ...a, status: editStatus, email: editEmail, approved_at } : a))
    setSelected(null)
  }

  if (loading) return <div className="p-8 text-gray-500">로딩 중...</div>

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <BackButton href="/admin" />
      <h1 className="text-2xl font-bold mb-6">여행사 리스트 <span className="text-gray-400 font-normal text-lg">({agencies.length})</span></h1>
      {agencies.length === 0 ? (
        <p className="text-gray-400">등록된 여행사가 없습니다.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">여행사 ID</th>
                <SortTh label="회사명" sortKey="company_name" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="이메일" sortKey="email" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="상태" sortKey="status" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="가입일" sortKey="created_at" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="최초승인일" sortKey="approved_at" current={sortKey} dir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((agency, i) => (
                <tr
                  key={agency.id}
                  onClick={() => openModal(agency)}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-3 font-mono text-sm text-gray-600">{'A' + String(i + 1).padStart(5, '0')}</td>
                  <td className="px-5 py-3 font-medium text-gray-800">{agency.company_name}</td>
                  <td className="px-5 py-3 text-gray-500">{agency.email}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[agency.status as Status]}`}>
                      {STATUS_LABEL[agency.status as Status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400">
                    {new Date(agency.created_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                  </td>
                  <td className="px-5 py-3 text-gray-400">
                    {agency.approved_at ? new Date(agency.approved_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }) : '-'}
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
