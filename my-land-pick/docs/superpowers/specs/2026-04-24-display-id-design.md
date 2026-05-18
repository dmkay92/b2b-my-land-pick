# 표시용 ID(display_id) 도입

## 배경

현재 모든 테이블의 PK가 UUID로 되어있어 관리자/실무자가 데이터를 식별하기 어렵다. 내부 PK(uuid)는 유지하고, 사용자에게 보여주는 표시용 ID 컬럼을 추가한다.

## 대상 테이블 및 형식

| 테이블 | 컬럼명 | 접두사 | 형식 | 예시 |
|--------|--------|--------|------|------|
| profiles (여행사) | display_id | A | `A` + 6자리 순번 | `A000001` |
| profiles (랜드사) | display_id | L | `L` + 6자리 순번 | `L000001` |
| quote_requests | display_id | REQ | `REQ-YYYYMMDD-` + 6자리 순번 | `REQ-20260424-000001` |
| quotes | display_id | QOT | `QOT-YYYYMMDD-` + 6자리 순번 | `QOT-20260424-000001` |
| quote_settlements | display_id | STL | `STL-YYYYMMDD-` + 6자리 순번 | `STL-20260424-000001` |
| payment_schedules | display_id | PSC | `PSC-YYYYMMDD-` + 6자리 순번 | `PSC-20260424-000001` |
| payment_installments | display_id | PIN | `PIN-YYYYMMDD-` + 6자리 순번 | `PIN-20260424-000001` |
| payment_transactions | display_id | TXN | `TXN-YYYYMMDD-` + 6자리 순번 | `TXN-20260424-000001` |

## 설계

### 1. DB 변경

각 테이블에 `display_id text UNIQUE` 컬럼 추가.

### 2. 채번 방식

Supabase DB function으로 구현:

```sql
CREATE OR REPLACE FUNCTION generate_display_id(prefix text, use_date boolean DEFAULT true)
RETURNS text AS $$
DECLARE
  today text;
  seq_name text;
  next_val bigint;
BEGIN
  IF use_date THEN
    today := to_char(now(), 'YYYYMMDD');
    seq_name := 'display_id_' || lower(prefix) || '_' || today;
  ELSE
    seq_name := 'display_id_' || lower(prefix);
  END IF;

  -- 시퀀스가 없으면 생성
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = seq_name) THEN
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', seq_name);
  END IF;

  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_val;

  IF use_date THEN
    RETURN prefix || '-' || today || '-' || lpad(next_val::text, 6, '0');
  ELSE
    RETURN prefix || lpad(next_val::text, 6, '0');
  END IF;
END;
$$ LANGUAGE plpgsql;
```

### 3. 자동 생성 (DB 트리거)

각 테이블에 BEFORE INSERT 트리거:

```sql
-- 예: quote_requests
CREATE OR REPLACE FUNCTION set_display_id_quote_requests()
RETURNS trigger AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := generate_display_id('REQ', true);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_display_id_quote_requests
  BEFORE INSERT ON quote_requests
  FOR EACH ROW EXECUTE FUNCTION set_display_id_quote_requests();
```

profiles는 role에 따라 접두사 분기:

```sql
CREATE OR REPLACE FUNCTION set_display_id_profiles()
RETURNS trigger AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    IF NEW.role = 'agency' THEN
      NEW.display_id := generate_display_id('A', false);
    ELSIF NEW.role = 'landco' THEN
      NEW.display_id := generate_display_id('L', false);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 4. 기존 데이터 백필

이미 존재하는 레코드에 display_id를 채워넣는 마이그레이션 실행.

### 5. UI 노출

- 기존에 uuid가 보이던 곳을 display_id로 교체
- 내부 로직(FK, RLS, API 호출)은 uuid 그대로 유지
- 검색/필터에서 display_id로 검색 가능하도록

### 6. 기존 event_number 와의 관계

quote_requests에 이미 `event_number` 컬럼(EVT-YYYY-NNNN)이 존재한다. 이것은 행사 관리 번호이고, `display_id`(REQ-)는 시스템 내부 식별 번호로 용도가 다르므로 둘 다 유지한다.

## 수정 대상

| 영역 | 변경 내용 |
|------|----------|
| supabase/migrations | display_id 컬럼 + 함수 + 트리거 + 백필 |
| src/lib/supabase/types.ts | 각 인터페이스에 display_id 추가 |
| UI 페이지들 | uuid 노출 → display_id 노출로 교체 |
| 엑셀 export | display_id 포함 |
