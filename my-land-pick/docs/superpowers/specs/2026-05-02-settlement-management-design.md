# 정산 관리 페이지

## 개요

Admin이 건별 정산을 검토/확정하고, 정산 명세서를 자동 생성하여 랜드사에 제공하는 기능.

## 정산 계산 규칙

### 정상 완료
```
랜드사 정산금 = 견적가 - 플랫폼 수수료(견적가 × 5%)
여행사 수수료 = 여행사가 설정한 수수료
플랫폼 수익 = 견적가 × 5%
```

### 7일 이전 취소 (100% 환불)
```
플랫폼 수수료 = 0원
공제 없음 → 전액 환불, 랜드사 정산금 0원
공제 있음 → 공제 전액 랜드사 지급
           고객 환불 = 결제완료 - 공제
           공제 > 결제완료 시 여행사 추가 청구
```

### 1~6일 전 취소 (50% 환불)
```
취소수수료 = 총 고객가 × 50%
랜드사 기본 = 견적가 × 50% - 플랫폼 수수료
플랫폼 수수료 = 견적가 × 50% × 5%
여행사 수수료 = 수수료 × 50%

공제 ≤ 랜드사 기본: 랜드사 기본 그대로 지급
공제 > 랜드사 기본: 초과분 충당 순서
  1. 여행사 수수료에서 차감
  2. 플랫폼 수수료에서 차감
  3. 여행사에 추가 청구
```

### 당일/노쇼 (0% 환불)
정상 완료와 동일 (전액 취소수수료)

## UI

### Admin 사이드바
"정산 관리" 메뉴 (`/admin/settlements`)

### 정산 건 목록
필터 탭: 정산 대기 | 검토중 | 확정 | 입금완료 | 전체

테이블 컬럼:
- 견적 ID (REQ-...)
- 행사명
- 여행사
- 랜드사
- 여행기간
- 상태
- 총 고객가
- 결제완료

### 정산 상세 (건 클릭 시)

1. **기본 정보**: 견적 ID, 행사명, 여행사, 랜드사, 여행 기간, 취소 여부
2. **금액 요약**: 상태별 계산 결과 (위 규칙 적용)
3. **결제 현황**: 회차별 결제 상태
4. **공제 내역**: 승인된 공제 항목 (취소 건만)
5. **정산 액션**:
   - "검토 시작" → reviewing
   - "정산 확정" → confirmed + 명세서 PDF 생성
   - "랜드사 입금 완료" / "여행사 수수료 입금 완료" → paid
   - 명세서 다운로드
   - 메모 입력

## DB 변경

`quote_settlements` 테이블에 컬럼 추가:
```sql
ALTER TABLE quote_settlements ADD COLUMN IF NOT EXISTS settlement_status text DEFAULT 'pending' CHECK (settlement_status IN ('pending', 'reviewing', 'confirmed', 'paid'));
ALTER TABLE quote_settlements ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE quote_settlements ADD COLUMN IF NOT EXISTS landco_paid_at timestamptz;
ALTER TABLE quote_settlements ADD COLUMN IF NOT EXISTS agency_paid_at timestamptz;
ALTER TABLE quote_settlements ADD COLUMN IF NOT EXISTS settlement_memo text;
```

## API

### `GET /api/admin/settlements`
정산 건 목록 조회. status 필터, quote_requests + profiles JOIN.

### `PATCH /api/admin/settlements/[id]`
상태 변경 (reviewing → confirmed → paid), 메모 업데이트.

### `GET /api/admin/settlements/[id]/statement`
정산 명세서 PDF (HTML → print). 확정 후에만 생성 가능.

## 정산 명세서 PDF
인보이스와 동일한 디자인 톤.
- 공급자: (주)마이리얼트립
- 공급받는자: 랜드사 정보 (사업자번호, 대표자, 주소)
- 견적가, 플랫폼 수수료, 공제 내역, 정산금
- 입금 계좌: 랜드사가 등록한 계좌
- 발행일, 정산 번호

## 정산 계산 유틸
`src/lib/settlement.ts`에 정산 계산 함수 분리:

```typescript
interface SettlementCalcInput {
  landcoQuoteTotal: number
  agencyCommission: number
  totalCustomerPrice: number
  paidAmount: number
  approvedDeduction: number
  requestStatus: 'finalized' | 'closed'
  daysUntilDepart: number // 취소 시점 기준
}

interface SettlementCalcResult {
  platformFee: number
  landcoPayout: number
  agencyPayout: number
  customerRefund: number
  agencyAdditionalCharge: number
  platformRevenue: number
}
```
