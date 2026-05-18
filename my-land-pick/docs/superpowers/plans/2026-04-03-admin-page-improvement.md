# Admin Page Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 대시보드에서 승인 대기 유저의 상세 정보를 모달로 확인하고, 카드 요약 개선 및 국가 선택을 모달에 통합한다.

**Architecture:** `src/app/(dashboard)/admin/page.tsx` 단일 파일만 수정. `countryModal` 상태를 `detailModal`로 통합하여 상세 정보 + 국가 선택 + 승인/거절 버튼을 하나의 모달에서 처리. 서류 URL은 이미 `Profile`에 포함되어 있으므로 별도 API 추가 불필요.

**Tech Stack:** React, Next.js App Router, Tailwind CSS, Supabase client

---

### Task 1: 요약 카드에 대기 수 추가 + 카드에 상세 정보 노출

**Files:**
- Modify: `src/app/(dashboard)/admin/page.tsx`

현재 요약 카드는 승인된 수만 표시. 대기 중인 수도 함께 표시하도록 수정.
현재 pending 카드에는 회사명 + 이메일만 표시. BRN, 대표자명, 신청일 추가.

- [ ] **Step 1: 요약 카드 수정**

`src/app/(dashboard)/admin/page.tsx`의 요약 카드 섹션을 아래로 교체:

```tsx
{/* 현황 카드 */}
<div className="grid grid-cols-2 gap-4 mb-10">
  <button onClick={() => router.push('/admin/agencies')} className="bg-white rounded-xl shadow-sm p-6 text-left hover:shadow-md transition-shadow cursor-pointer">
    <p className="text-sm text-gray-400 mb-1">여행사</p>
    <p className="text-3xl font-bold text-gray-800">{agencyCount}<span className="text-base font-normal text-gray-400 ml-1">개사 승인</span></p>
    {pendingAgencies.length > 0 && (
      <p className="text-xs text-amber-500 mt-1">대기 {pendingAgencies.length}건</p>
    )}
  </button>
  <button onClick={() => router.push('/admin/landcos')} className="bg-white rounded-xl shadow-sm p-6 text-left hover:shadow-md transition-shadow cursor-pointer">
    <p className="text-sm text-gray-400 mb-1">랜드사</p>
    <p className="text-3xl font-bold text-gray-800">{landcoCount}<span className="text-base font-normal text-gray-400 ml-1">개사 승인</span></p>
    {pendingLandcos.length > 0 && (
      <p className="text-xs text-amber-500 mt-1">대기 {pendingLandcos.length}건</p>
    )}
  </button>
</div>
```

- [ ] **Step 2: pending 카드 정보 확장 (클릭 가능하게)**

카드 클릭 시 상세 모달이 열리도록 `onClick` 추가. 카드에 BRN, 대표자명, 신청일 표시.

기존 pendingAgencies 카드 JSX를:
```tsx
<div key={user.id} className="bg-white p-4 rounded-lg shadow-sm flex items-center justify-between">
  <div>
    <p className="font-medium text-sm">{user.company_name}</p>
    <p className="text-xs text-gray-400">{user.email}</p>
  </div>
  <div className="flex gap-2">
    <button onClick={() => handleApprove(user.id, 'approved')} className="bg-green-500 text-white px-3 py-1 rounded text-xs hover:bg-green-600">승인</button>
    <button onClick={() => handleApprove(user.id, 'rejected')} className="bg-red-100 text-red-600 px-3 py-1 rounded text-xs hover:bg-red-200">거절</button>
  </div>
</div>
```

아래로 교체 (pendingAgencies, pendingLandcos 둘 다):
```tsx
<div
  key={user.id}
  onClick={() => openDetailModal(user)}
  className="bg-white p-4 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow"
>
  <div className="flex items-start justify-between">
    <div>
      <p className="font-medium text-sm">{user.company_name}</p>
      <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
      {user.business_registration_number && (
        <p className="text-xs text-gray-400">사업자 {user.business_registration_number}</p>
      )}
      {user.representative_name && (
        <p className="text-xs text-gray-400">대표자 {user.representative_name}</p>
      )}
    </div>
    <p className="text-xs text-gray-300 shrink-0 ml-2">
      {new Date(user.created_at).toLocaleDateString('ko-KR')}
    </p>
  </div>
</div>
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/(dashboard)/admin/page.tsx
git commit -m "feat: admin dashboard - add pending count to summary cards, expand pending user card info"
```

---

### Task 2: countryModal → detailModal 통합 (상세 모달 구현)

**Files:**
- Modify: `src/app/(dashboard)/admin/page.tsx`

기존 `countryModal` state 제거 후 `detailModal`로 통합. 상세 모달에서:
- 전체 프로필 정보 표시 (사업자번호, 회사명, 대표자, 이메일, 연락처, 계좌)
- 서류 다운로드 링크 (사업자등록증, 통장 사본)
- 랜드사인 경우 국가 선택 UI
- 승인 / 거절 버튼

- [ ] **Step 1: state 교체**

파일 상단 state 선언 부분에서:
```tsx
// 국가 지정 팝업
const [countryModal, setCountryModal] = useState<{ user: Profile } | null>(null)
const [selectedCodes, setSelectedCodes] = useState<string[]>([])
const [saving, setSaving] = useState(false)
```
를 아래로 교체:
```tsx
// 상세 모달
const [detailModal, setDetailModal] = useState<{ user: Profile } | null>(null)
const [selectedCodes, setSelectedCodes] = useState<string[]>([])
const [saving, setSaving] = useState(false)

function openDetailModal(user: Profile) {
  setSelectedCodes([])
  setDetailModal({ user })
}
```

- [ ] **Step 2: handleApprove 수정**

기존 `handleApprove` 함수에서 `countryModal` 참조를 `detailModal`로 교체:
```tsx
async function handleApprove(userId: string, status: 'approved' | 'rejected') {
  if (status === 'approved') {
    const user = pendingUsers.find(u => u.id === userId)
    if (user?.role === 'landco' && selectedCodes.length === 0) {
      // 국가 미선택 시 알림 (모달 내에서 처리하므로 guard만)
      return
    }
  }
  const res = await fetch('/api/admin/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, status }),
  })
  if (!res.ok) return
  const user = pendingUsers.find(u => u.id === userId)
  setPendingUsers(prev => prev.filter(u => u.id !== userId))
  if (status === 'approved' && user?.role === 'agency') setAgencyCount(c => c + 1)
  setDetailModal(null)
}
```

- [ ] **Step 3: handleApproveWithCountries 수정**

`countryModal` → `detailModal` 참조 교체:
```tsx
async function handleApproveWithCountries() {
  if (!detailModal) return
  setSaving(true)
  const { user } = detailModal
  const [approveRes, countryRes] = await Promise.all([
    fetch('/api/admin/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, status: 'approved' }),
    }),
    fetch('/api/admin/assign-countries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ landcoId: user.id, countryCodes: selectedCodes }),
    }),
  ])
  setSaving(false)
  if (!approveRes.ok || !countryRes.ok) return
  setPendingUsers(prev => prev.filter(u => u.id !== user.id))
  setLandcoCount(c => c + 1)
  setDetailModal(null)
}
```

- [ ] **Step 4: 상세 모달 JSX 교체**

기존 `{/* 국가 지정 모달 */}` 블록 전체를 아래로 교체:
```tsx
{/* 상세 모달 */}
{detailModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
        <div>
          <h3 className="text-base font-bold text-gray-900">{detailModal.user.company_name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {detailModal.user.role === 'agency' ? '여행사' : '랜드사'} · 신청일 {new Date(detailModal.user.created_at).toLocaleDateString('ko-KR')}
          </p>
        </div>
        <button onClick={() => setDetailModal(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
      </div>

      <div className="px-6 py-4 space-y-4">
        {/* 기본 정보 */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">기본 정보</h4>
          <dl className="space-y-1.5">
            <InfoRow label="이메일" value={detailModal.user.email} />
            <InfoRow label="사업자등록번호" value={detailModal.user.business_registration_number} />
            <InfoRow label="대표자명" value={detailModal.user.representative_name} />
            <InfoRow label="유선" value={detailModal.user.phone_landline} />
            <InfoRow label="휴대폰" value={detailModal.user.phone_mobile} />
          </dl>
        </section>

        {/* 계좌 정보 */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">정산 계좌</h4>
          <dl className="space-y-1.5">
            <InfoRow label="은행" value={detailModal.user.bank_name} />
            <InfoRow label="계좌번호" value={detailModal.user.bank_account} />
            <InfoRow label="예금주" value={detailModal.user.bank_holder} />
          </dl>
        </section>

        {/* 서류 */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">첨부 서류</h4>
          <div className="flex gap-2">
            {detailModal.user.document_biz_url ? (
              <a
                href={detailModal.user.document_biz_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center text-xs text-blue-600 border border-blue-200 rounded-lg py-2 hover:bg-blue-50 transition-colors"
              >
                사업자등록증 ↗
              </a>
            ) : (
              <span className="flex-1 text-center text-xs text-gray-300 border border-gray-100 rounded-lg py-2">사업자등록증 없음</span>
            )}
            {detailModal.user.document_bank_url ? (
              <a
                href={detailModal.user.document_bank_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center text-xs text-blue-600 border border-blue-200 rounded-lg py-2 hover:bg-blue-50 transition-colors"
              >
                통장 사본 ↗
              </a>
            ) : (
              <span className="flex-1 text-center text-xs text-gray-300 border border-gray-100 rounded-lg py-2">통장 사본 없음</span>
            )}
          </div>
        </section>

        {/* 랜드사 국가 선택 */}
        {detailModal.user.role === 'landco' && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">담당 국가 지정</h4>
            <div className="flex flex-wrap gap-2">
              {COUNTRY_OPTIONS.map(country => {
                const selected = selectedCodes.includes(country.code)
                return (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => setSelectedCodes(prev =>
                      prev.includes(country.code) ? prev.filter(c => c !== country.code) : [...prev, country.code]
                    )}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      selected ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {country.name}
                  </button>
                )
              })}
            </div>
            {selectedCodes.length === 0 && (
              <p className="text-xs text-amber-500 mt-1">승인 시 국가를 1개 이상 선택해주세요.</p>
            )}
          </section>
        )}
      </div>

      {/* 하단 버튼 */}
      <div className="flex gap-2 px-6 pb-6 pt-2">
        <button
          onClick={() => handleApprove(detailModal.user.id, 'rejected')}
          disabled={saving}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          거절
        </button>
        {detailModal.user.role === 'landco' ? (
          <button
            onClick={handleApproveWithCountries}
            disabled={saving || selectedCodes.length === 0}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-40"
          >
            {saving ? '처리 중...' : '승인'}
          </button>
        ) : (
          <button
            onClick={() => handleApprove(detailModal.user.id, 'approved')}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            {saving ? '처리 중...' : '승인'}
          </button>
        )}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: InfoRow 헬퍼 컴포넌트 추가**

파일 하단 (export default 외부)에 추가:
```tsx
function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2">
      <dt className="text-xs text-gray-400 w-24 shrink-0">{label}</dt>
      <dd className="text-xs text-gray-700 break-all">{value || <span className="text-gray-300">-</span>}</dd>
    </div>
  )
}
```

- [ ] **Step 6: 동작 확인**

```bash
cd /Users/youngjun-hwang/Desktop/Claude/incentive-quote/.worktrees/feature/incentive-quote-mvp
npm run build 2>&1 | tail -20
```

Expected: 빌드 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add src/app/(dashboard)/admin/page.tsx
git commit -m "feat: admin - replace country modal with unified detail modal"
```
