'use client'

import { useEffect, useRef, useState } from 'react'
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
  if (log.action_type === 'profile_update') {
    const changes = d.changes as { field: string; from: unknown; to: unknown }[] | undefined
    if (changes && changes.length > 0) {
      return changes.map(c => `${c.field}: ${c.from || '-'} → ${c.to || '-'}`).join('\n')
    }
    return '프로필 수정'
  }
  return ''
}

function formatLogDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }) +
    ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

type SortKey = 'display_id' | 'company_name' | 'email' | 'status' | 'created_at' | 'approved_at' | 'business_registration_number' | 'representative_name'

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
  const [sortKey, setSortKey] = useState<SortKey>('display_id')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected] = useState<Profile | null>(null)
  const [editStatus, setEditStatus] = useState<Status>('approved')
  const [editEmail, setEditEmail] = useState('')
  const [editingEmail, setEditingEmail] = useState(false)
  const [editRepName, setEditRepName] = useState('')
  const [editPhoneLandline, setEditPhoneLandline] = useState('')
  const [editPhoneMobile, setEditPhoneMobile] = useState('')
  const [editBankName, setEditBankName] = useState('')
  const [editBankAccount, setEditBankAccount] = useState('')
  const [editBankHolder, setEditBankHolder] = useState('')
  const [editPartnerCode, setEditPartnerCode] = useState('')
  const [editingBasic, setEditingBasic] = useState(false)
  const [editingBank, setEditingBank] = useState(false)
  const [editingPartner, setEditingPartner] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pendingStatus, setPendingStatus] = useState<Status | null>(null)
  const [logs, setLogs] = useState<AdminActionLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected) modalRef.current?.focus()
  }, [selected])

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
    setEditRepName(agency.representative_name ?? '')
    setEditPhoneLandline(agency.phone_landline ?? '')
    setEditPhoneMobile(agency.phone_mobile ?? '')
    setEditBankName(agency.bank_name ?? '')
    setEditBankAccount(agency.bank_account ?? '')
    setEditBankHolder(agency.bank_holder ?? '')
    setEditPartnerCode(agency.partner_code ?? '')
    setEditingBasic(false)
    setEditingPartner(false)
    setEditingBank(false)
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
    const profileFields = {
      userId: selected.id,
      email: editEmail,
      representative_name: editRepName,
      phone_landline: editPhoneLandline,
      phone_mobile: editPhoneMobile,
      bank_name: editBankName,
      bank_account: editBankAccount,
      bank_holder: editBankHolder,
      partner_code: editPartnerCode,
    }
    const profileChanged = editEmail !== selected.email
      || editRepName !== (selected.representative_name ?? '')
      || editPhoneLandline !== (selected.phone_landline ?? '')
      || editPhoneMobile !== (selected.phone_mobile ?? '')
      || editBankName !== (selected.bank_name ?? '')
      || editBankAccount !== (selected.bank_account ?? '')
      || editBankHolder !== (selected.bank_holder ?? '')
      || editPartnerCode !== (selected.partner_code ?? '')

    if (!statusChanged && !profileChanged) { setSelected(null); return }
    setSaving(true)
    setSaveError(null)
    const results = await Promise.all([
      statusChanged ? fetch('/api/admin/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selected.id, status: editStatus }),
      }) : Promise.resolve(null),
      profileChanged ? fetch('/api/admin/profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileFields),
      }) : Promise.resolve(null),
    ])
    setSaving(false)
    const failed = results.find(r => r !== null && !r.ok)
    if (failed) {
      const json = await failed.json().catch(() => ({}))
      setSaveError(json.error ?? '저장 중 오류가 발생했습니다.')
      return
    }
    const approved_at = editStatus === 'approved' ? (selected.approved_at ?? new Date().toISOString()) : selected.approved_at
    setAgencies(prev => prev.map(a => a.id === selected.id ? {
      ...a, status: editStatus, email: editEmail, approved_at,
      representative_name: editRepName, phone_landline: editPhoneLandline, phone_mobile: editPhoneMobile,
      bank_name: editBankName, bank_account: editBankAccount, bank_holder: editBankHolder, partner_code: editPartnerCode,
    } : a))
    setSelected(null)
  }

  if (loading) return <div className="p-8 text-gray-500">로딩 중...</div>

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <BackButton href="/admin" />
      <h1 className="text-2xl font-bold mb-6">여행사 리스트 <span className="text-gray-400 font-normal text-lg">({agencies.length})</span></h1>
      {agencies.length === 0 ? (
        <p className="text-gray-400">등록된 여행사가 없습니다.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <SortTh label="여행사 ID" sortKey="display_id" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="회사명" sortKey="company_name" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="사업자등록번호" sortKey="business_registration_number" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="대표자명" sortKey="representative_name" current={sortKey} dir={sortDir} onSort={handleSort} />
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
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{agency.display_id ?? 'A' + String(agency.seq_id ?? i + 1).padStart(5, '0')}</td>
                  <td className="px-5 py-3 font-medium text-gray-800 whitespace-nowrap">{agency.company_name}</td>
                  <td className="px-5 py-3 text-gray-500 font-mono text-xs">{agency.business_registration_number ?? '-'}</td>
                  <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{agency.representative_name ?? '-'}</td>
                  <td className="px-5 py-3 text-gray-500">{agency.email}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[agency.status as Status]}`}>
                      {STATUS_LABEL[agency.status as Status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 whitespace-nowrap">
                    {new Date(agency.created_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                  </td>
                  <td className="px-5 py-3 text-gray-400 whitespace-nowrap">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)} onKeyDown={(e) => e.key === 'Escape' && setSelected(null)}>
          <div ref={modalRef} className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto outline-none" onClick={e => e.stopPropagation()} tabIndex={-1} onKeyDown={(e) => e.key === 'Escape' && setSelected(null)}>
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">{selected.company_name}</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                <span className="font-mono font-medium text-gray-500">{selected.display_id ?? 'A' + String(selected.seq_id ?? '?').padStart(5, '0')}</span>
                <span className="mx-1.5 text-gray-300">·</span>여행사
              </p>
            </div>

            <div className="px-6 py-4 space-y-5">
              {/* 기본 정보 */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">기본 정보</p>
                  <button onClick={() => setEditingBasic(!editingBasic)} className="text-xs text-blue-500 hover:text-blue-700">
                    {editingBasic ? '완료' : '수정'}
                  </button>
                </div>
                <dl className="space-y-2 text-sm">
                  <InfoRow label="사업자번호" value={selected.business_registration_number} />
                  {editingBasic ? (
                    <>
                      <EditRow label="대표자명" value={editRepName} onChange={setEditRepName} />
                      <EditRow label="이메일" value={editEmail} onChange={setEditEmail} />
                      <EditRow label="유선" value={editPhoneLandline} onChange={setEditPhoneLandline} />
                      <EditRow label="휴대폰" value={editPhoneMobile} onChange={setEditPhoneMobile} />
                    </>
                  ) : (
                    <>
                      <InfoRow label="대표자명" value={editRepName} />
                      <InfoRow label="이메일" value={editEmail} />
                      <InfoRow label="유선" value={editPhoneLandline} />
                      <InfoRow label="휴대폰" value={editPhoneMobile} />
                    </>
                  )}
                  <InfoRow label="가입일" value={new Date(selected.created_at).toLocaleDateString('ko-KR')} />
                  <InfoRow label="최초승인일" value={selected.approved_at ? new Date(selected.approved_at).toLocaleDateString('ko-KR') : null} />
                  {logs.length > 0 && <InfoRow label="최종수정일" value={formatLogDate(logs[0].created_at)} />}
                </dl>
              </section>

              {/* 정산 계좌 */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">정산 계좌</p>
                  <button onClick={() => setEditingBank(!editingBank)} className="text-xs text-blue-500 hover:text-blue-700">
                    {editingBank ? '완료' : '수정'}
                  </button>
                </div>
                <dl className="space-y-2 text-sm">
                  {editingBank ? (
                    <>
                      <EditRow label="은행" value={editBankName} onChange={setEditBankName} />
                      <EditRow label="계좌번호" value={editBankAccount} onChange={setEditBankAccount} />
                      <EditRow label="예금주" value={editBankHolder} onChange={setEditBankHolder} />
                    </>
                  ) : (
                    <>
                      <InfoRow label="은행" value={editBankName} />
                      <InfoRow label="계좌번호" value={editBankAccount} />
                      <InfoRow label="예금주" value={editBankHolder} />
                    </>
                  )}
                </dl>
              </section>

              {/* 거래처 정보 */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">거래처 정보</p>
                  <button onClick={() => setEditingPartner(!editingPartner)} className="text-xs text-blue-500 hover:text-blue-700">
                    {editingPartner ? '완료' : '수정'}
                  </button>
                </div>
                <dl className="space-y-2 text-sm">
                  {editingPartner ? (
                    <EditRow label="거래처코드" value={editPartnerCode} onChange={setEditPartnerCode} />
                  ) : (
                    <InfoRow label="거래처코드" value={editPartnerCode} />
                  )}
                </dl>
              </section>

              {/* 서류 */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">첨부 서류</p>
                <div className="flex gap-2">
                  {selected.document_biz_url ? (
                    <button
                      onClick={async () => {
                        const { data } = await supabase.storage.from('signup-documents').createSignedUrl(selected.document_biz_url!, 3600)
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                      }}
                      className="flex-1 rounded-lg border border-blue-200 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
                    >
                      사업자등록증 ↗
                    </button>
                  ) : (
                    <span className="flex-1 rounded-lg border border-gray-100 py-1.5 text-xs text-gray-300 text-center">사업자등록증 없음</span>
                  )}
                  {selected.document_bank_url ? (
                    <button
                      onClick={async () => {
                        const { data } = await supabase.storage.from('signup-documents').createSignedUrl(selected.document_bank_url!, 3600)
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                      }}
                      className="flex-1 rounded-lg border border-blue-200 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
                    >
                      통장 사본 ↗
                    </button>
                  ) : (
                    <span className="flex-1 rounded-lg border border-gray-100 py-1.5 text-xs text-gray-300 text-center">통장 사본 없음</span>
                  )}
                </div>
              </section>

              {/* 상태 변경 */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">상태 변경</p>
                <div className="flex gap-2">
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
              </section>

              {/* 액션 로그 */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">액션 로그</p>
                <div className="h-36 overflow-y-auto rounded-lg bg-gray-50 px-3 py-2">
                  {logsLoading ? (
                    <p className="text-xs text-gray-400 py-2">로딩 중...</p>
                  ) : logs.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2">기록된 액션이 없습니다.</p>
                  ) : (
                    <ul className="space-y-2">
                      {logs.map(log => (
                        <li key={log.id} className="flex gap-3 text-xs">
                          <span className="text-gray-400 shrink-0 w-32">{formatLogDate(log.created_at)}</span>
                          <span className="text-gray-700">{formatLogDetail(log)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>

            {saveError && (
              <div className="mx-6 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                {saveError}
              </div>
            )}
            <div className="flex gap-2 px-6 pb-6 pt-2">
              <button onClick={() => { setSelected(null); setSaveError(null) }} className="flex-1 py-2.5 rounded-xl text-sm text-gray-500 border border-gray-200 hover:bg-gray-50">취소</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2">
      <dt className="text-xs text-gray-400 w-20 shrink-0">{label}</dt>
      <dd className="text-xs text-gray-700 break-all">{value || <span className="text-gray-300">-</span>}</dd>
    </div>
  )
}

function EditRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 items-center">
      <dt className="text-xs text-gray-400 w-20 shrink-0">{label}</dt>
      <dd className="flex-1">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 focus:outline-none focus:border-blue-400"
        />
      </dd>
    </div>
  )
}
