# Google Form CRM 자동화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구글폼 제출 시 Gemini AI가 상담내용을 분석해 구글시트 CRM에 자동으로 행을 추가한다.

**Architecture:** Google Apps Script 4개 파일로 구성. `Config.gs`에 상수 정의, `SheetService.gs`에 시트 조작, `GeminiService.gs`에 AI API 호출, `Code.gs`에 메인 핸들러. 모든 설정값(API 키, 시트 ID)은 Script Properties에 저장.

**Tech Stack:** Google Apps Script (JavaScript), Gemini Flash REST API (`responseMimeType: 'application/json'` 사용으로 JSON 응답 강제), Google Sheets API (SpreadsheetApp), Google Forms (onFormSubmit trigger)

> **JSON 키 이름 설계 결정:** Gemini 프롬프트와 파서는 공백 없는 단축 키(`월발권량`, `GDS`, `메인에이전시`, `메인타겟`)를 사용한다. 시트 컬럼명(`월 발권량`, `GDS 사용 유무` 등)과 다르지만 파싱 오류 방지를 위해 의도적으로 단축. 프롬프트와 파서는 항상 같은 키 이름을 유지해야 한다.

> **알려진 제약:** `#` 값은 `(타겟 행 번호) - 2`로 계산. 시트 중간에 빈 행이 생기면(수동 삭제 등) 중복 번호가 발생할 수 있음. 운영 중 행 삭제는 피할 것.

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| `Config.gs` | 컬럼 인덱스, 드롭다운 선택지, 시작 행 번호 상수 |
| `SheetService.gs` | 거래처명 컬럼 기준 빈 행 탐색, 행 데이터 기입 |
| `GeminiService.gs` | Gemini API 호출, 마크다운 펜스 제거(안전망), JSON 파싱 |
| `Code.gs` | onFormSubmit 핸들러, LockService, 에러 처리 |

### 구글시트 컬럼 매핑 (1-based)

| 컬럼명 | 열 | Apps Script 인덱스 |
|--------|----|--------------------|
| # | B | 2 |
| 인바운드/아웃바운드 | C | 3 |
| 거래처명 | D | 4 |
| 담당자명 | E | 5 |
| 전화번호 | F | 6 |
| E-mail | G | 7 |
| 주소 | H | 8 |
| 대지역 | I | 9 |
| 소지역 | J | 10 |
| Category | K | 11 |
| 담당자 | L | 12 |
| 미팅/전화 일시 | M | 13 |
| 월 발권량 | N | 14 |
| GDS 사용 유무 | O | 15 |
| 메인 에이전시 | P | 16 |
| 메인 타겟 | Q | 17 |
| 비고 | R | 18 |

---

## Task 1: 프로젝트 초기 설정

**Files:**
- Create: Apps Script 편집기에서 `Config.gs`, `SheetService.gs`, `GeminiService.gs`, `Code.gs` 생성

- [ ] **Step 1: Apps Script 프로젝트 생성**

구글폼 편집 화면에서:
1. 상단 메뉴 → 점 3개(⋮) → "스크립트 편집기" 클릭
2. 프로젝트 이름을 "CRM 자동화"로 변경

> 반드시 **구글폼**에서 스크립트 편집기를 열어야 함. 시트에서 열면 `onFormSubmit` 이벤트가 폼과 자동 연결되지 않음.

- [ ] **Step 2: Script Properties 설정**

Apps Script 편집기에서:
1. 왼쪽 사이드바 → "프로젝트 설정(⚙️)" 클릭
2. 하단 "스크립트 속성" → "속성 추가":
   - `GEMINI_API_KEY` = (Google AI Studio에서 발급한 키)
   - `SPREADSHEET_ID` = (구글시트 URL의 `/d/` 다음 ~ `/edit` 이전 문자열)

> Google AI Studio: aistudio.google.com → "Get API key"

- [ ] **Step 3: 기본 파일 4개 생성**

Apps Script 편집기 왼쪽 "파일" 옆 "+" → "스크립트":
- `Config` 생성
- `SheetService` 생성
- `GeminiService` 생성
- 기존 `Code` 파일은 유지

---

## Task 2: Config.gs 작성

**Files:**
- Create: `Config.gs`

- [ ] **Step 1: Config.gs 전체 코드 작성**

```javascript
// Config.gs

var CONFIG = {
  // 데이터 시작 행 (1~2행은 헤더)
  DATA_START_ROW: 3,

  // 거래처명 컬럼 인덱스 (D열 = 4)
  COMPANY_COL: 4,

  // 행 데이터 시작 컬럼 (B열 = 2)
  ROW_START_COL: 2,

  // 전체 컬럼 수 (B~R = 17개)
  ROW_COL_COUNT: 17,

  // 각 컬럼의 rowData 배열 내 인덱스 (0-based, B열이 0)
  COL: {
    NUM: 0,           // B: #
    INBOUND: 1,       // C: 인바운드/아웃바운드
    COMPANY: 2,       // D: 거래처명
    CONTACT_NAME: 3,  // E: 담당자명
    PHONE: 4,         // F: 전화번호
    EMAIL: 5,         // G: E-mail
    ADDRESS: 6,       // H: 주소
    REGION_LARGE: 7,  // I: 대지역
    REGION_SMALL: 8,  // J: 소지역
    CATEGORY: 9,      // K: Category
    MANAGER: 10,      // L: 담당자
    MEETING_DATE: 11, // M: 미팅/전화 일시
    MONTHLY_VOL: 12,  // N: 월 발권량
    GDS: 13,          // O: GDS 사용 유무
    MAIN_AGENCY: 14,  // P: 메인 에이전시
    MAIN_TARGET: 15,  // Q: 메인 타겟
    NOTES: 16         // R: 비고
  },

  // 드롭다운 허용 값
  DROPDOWNS: {
    MONTHLY_VOL: ['없음/모름', '2천만원 이하', '2천만원~5천만원', '5천만원~1억원', '1억원 이상', '2억원 이상'],
    GDS: ['O', 'X'],
    MAIN_AGENCY: ['하나투어', '모두투어', '인터파크', '노랑풍선', '온라인투어', '마이리얼트립', '자체 BSP', '그 외'],
    MAIN_TARGET: ['상용', '인디비']
  }
};
```

- [ ] **Step 2: 저장 (Ctrl+S 또는 Cmd+S)**

---

## Task 3: SheetService.gs 작성

**Files:**
- Create: `SheetService.gs`

- [ ] **Step 1: SheetService.gs 전체 코드 작성**

```javascript
// SheetService.gs

/**
 * 거래처명 컬럼(D열)에서 첫 번째 빈 행 번호를 반환한다.
 * DATA_START_ROW(3행)부터 탐색. getLastRow()를 상한으로 사용해 불필요한 읽기 방지.
 * @param {Sheet} sheet
 * @returns {number} 행 번호 (1-based)
 */
function findFirstEmptyRow(sheet) {
  var startRow = CONFIG.DATA_START_ROW;
  var companyCol = CONFIG.COMPANY_COL;

  // getLastRow()로 실제 데이터가 있는 마지막 행까지만 읽음 (getMaxRows() 사용 금지)
  var lastRow = sheet.getLastRow();

  // 데이터가 전혀 없으면 바로 DATA_START_ROW 반환
  if (lastRow < startRow) return startRow;

  var values = sheet.getRange(startRow, companyCol, lastRow - startRow + 1, 1).getValues();

  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === '' || values[i][0] === null) {
      return startRow + i;
    }
  }

  // 모든 행이 차 있으면 다음 행에 추가
  return lastRow + 1;
}

/**
 * 지정된 행에 CRM 데이터를 기입한다.
 * @param {Sheet} sheet
 * @param {number} rowNum 기입할 행 번호
 * @param {Array} rowData CONFIG.ROW_COL_COUNT 길이의 배열 (B열부터)
 */
function writeRowData(sheet, rowNum, rowData) {
  var range = sheet.getRange(rowNum, CONFIG.ROW_START_COL, 1, CONFIG.ROW_COL_COUNT);
  range.setValues([rowData]);
  Logger.log('행 기입 완료: ' + rowNum + '행');
}

/**
 * 드롭다운 허용 값에 포함되면 해당 값, 아니면 빈 문자열 반환.
 * @param {string} value Gemini가 반환한 값
 * @param {Array<string>} allowedValues 허용 드롭다운 목록
 * @returns {string}
 */
function validateDropdown(value, allowedValues) {
  if (!value) return '';
  return allowedValues.indexOf(value) !== -1 ? value : '';
}
```

- [ ] **Step 2: 수동 테스트 함수 추가**

SheetService.gs 하단에 추가:

```javascript
/**
 * 수동 테스트: 빈 행 탐색 및 드롭다운 유효성 확인
 * Apps Script 편집기에서 직접 실행
 */
function testSheetService() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
  var sheet = ss.getSheets()[0];

  var targetRow = findFirstEmptyRow(sheet);
  Logger.log('첫 번째 빈 행: ' + targetRow); // 데이터 없으면 3 예상

  Logger.log(validateDropdown('하나투어', CONFIG.DROPDOWNS.MAIN_AGENCY)); // → 하나투어
  Logger.log(validateDropdown('없는값', CONFIG.DROPDOWNS.MAIN_AGENCY));   // → (빈 문자열)
  Logger.log(validateDropdown('O', CONFIG.DROPDOWNS.GDS));               // → O
}
```

- [ ] **Step 3: 저장 후 testSheetService 실행**

편집기 상단 함수 선택 드롭다운 → `testSheetService` → ▶️ 실행
- 처음 실행 시 권한 승인 팝업 → "권한 검토" → 계정 선택 → "허용"

예상 출력:
```
첫 번째 빈 행: 3
하나투어
(빈 문자열)
O
```

---

## Task 4: GeminiService.gs 작성

**Files:**
- Create: `GeminiService.gs`

- [ ] **Step 1: GeminiService.gs 전체 코드 작성**

```javascript
// GeminiService.gs
// 참고: responseMimeType: 'application/json' 을 사용해 Gemini가 JSON만 반환하도록 강제.
//       그럼에도 불구하고 마크다운 코드펜스가 포함될 수 있으므로 parseGeminiResponse에서 제거 처리.

var GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * 상담내용을 Gemini로 분석하여 구조화된 CRM 데이터를 반환한다.
 * @param {string} consultationText 상담내용 원문
 * @returns {{월발권량: string, GDS: string, 메인에이전시: string, 메인타겟: string, 비고: string}}
 * @throws {Error} API 호출 실패 또는 응답 구조 이상 시
 */
function analyzeConsultation(consultationText) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  var url = GEMINI_ENDPOINT + '?key=' + apiKey;

  var payload = {
    contents: [{
      parts: [{ text: buildPrompt(consultationText) }]
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json'
    }
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  Logger.log('Gemini API 호출 시작');
  var response = UrlFetchApp.fetch(url, options);
  var statusCode = response.getResponseCode();

  if (statusCode !== 200) {
    throw new Error('Gemini API 오류: HTTP ' + statusCode + ' - ' + response.getContentText());
  }

  var responseJson = JSON.parse(response.getContentText());

  // candidates가 비어있으면 (안전 필터 차단 등) 명확한 에러 발생
  if (!responseJson.candidates || responseJson.candidates.length === 0) {
    throw new Error('Gemini 응답에 candidates 없음: ' + response.getContentText());
  }

  var rawText = responseJson.candidates[0].content.parts[0].text;
  Logger.log('Gemini 원본 응답: ' + rawText);

  return parseGeminiResponse(rawText);
}

/**
 * Gemini 프롬프트를 생성한다.
 * 키 이름은 공백 없는 단축형 사용 (월발권량, GDS, 메인에이전시, 메인타겟).
 * @param {string} consultationText
 * @returns {string}
 */
function buildPrompt(consultationText) {
  return '다음은 여행사/항공 B2B 영업 상담 내용입니다.\n' +
    '아래 항목을 분석하여 JSON 형식으로만 응답하세요. 마크다운 코드블록 없이 순수 JSON만 반환하세요.\n\n' +
    '상담내용:\n' + consultationText + '\n\n' +
    '추출 항목:\n' +
    '1. 월발권량: 다음 중 하나만 선택 ["없음/모름", "2천만원 이하", "2천만원~5천만원", "5천만원~1억원", "1억원 이상", "2억원 이상"]. 판단 불가 시 ""\n' +
    '2. GDS: GDS 사용 여부. 다음 중 하나만 선택 ["O", "X"]. 판단 불가 시 ""\n' +
    '3. 메인에이전시: 다음 중 하나만 선택 ["하나투어", "모두투어", "인터파크", "노랑풍선", "온라인투어", "마이리얼트립", "자체 BSP", "그 외"]. 판단 불가 시 ""\n' +
    '4. 메인타겟: 다음 중 하나만 선택 ["상용", "인디비"]. 판단 불가 시 ""\n' +
    '5. 비고: 담당자 연락처, 요청사항, 특이사항 등 나머지 유용한 정보를 2~3줄로 요약. 없으면 ""\n\n' +
    '응답 형식 (반드시 이 키 이름 그대로 사용):\n' +
    '{"월발권량": "", "GDS": "", "메인에이전시": "", "메인타겟": "", "비고": ""}';
}

/**
 * Gemini 응답 텍스트에서 마크다운 코드펜스를 제거하고 JSON을 파싱한다.
 * responseMimeType 설정에도 불구하고 펜스가 포함될 수 있으므로 안전망으로 처리.
 * @param {string} rawText
 * @returns {Object}
 * @throws {Error} JSON 파싱 실패 시
 */
function parseGeminiResponse(rawText) {
  var cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  var parsed = JSON.parse(cleaned);

  // 키 누락 시 빈 문자열로 보완 (에러 아님)
  return {
    월발권량: parsed['월발권량'] || '',
    GDS: parsed['GDS'] || '',
    메인에이전시: parsed['메인에이전시'] || '',
    메인타겟: parsed['메인타겟'] || '',
    비고: parsed['비고'] || ''
  };
}
```

- [ ] **Step 2: 수동 테스트 함수 추가**

GeminiService.gs 하단에 추가:

```javascript
/**
 * 수동 테스트: 마크다운 코드펜스 제거 검증 (API 키 불필요)
 */
function testParseGeminiResponse() {
  var withFence = '```json\n{"월발권량": "2천만원~5천만원", "GDS": "O", "메인에이전시": "하나투어", "메인타겟": "인디비", "비고": "테스트"}\n```';
  var withoutFence = '{"월발권량": "1억원 이상", "GDS": "X", "메인에이전시": "", "메인타겟": "상용", "비고": ""}';
  var missingKeys = '{"월발권량": "없음/모름"}'; // 키 누락 케이스

  var r1 = parseGeminiResponse(withFence);
  var r2 = parseGeminiResponse(withoutFence);
  var r3 = parseGeminiResponse(missingKeys);

  Logger.log('펜스 있음 - 월발권량: ' + r1.월발권량);   // → 2천만원~5천만원
  Logger.log('펜스 없음 - 월발권량: ' + r2.월발권량);   // → 1억원 이상
  Logger.log('키 누락 - GDS: "' + r3.GDS + '"');       // → "" (빈 문자열, 에러 없음)
}

/**
 * 수동 테스트: Gemini API 실제 호출 (API 키 필요)
 */
function testGeminiService() {
  var sampleText = '하나투어 통해서 주로 동남아 인디비 위주. 월 발권 규모는 3천만원 정도. ' +
    'GDS는 Sabre 쓰고 있음. 담당자 김철수 대리 010-1234-5678. 다음 달 미팅 요청함.';

  try {
    var result = analyzeConsultation(sampleText);
    Logger.log('월발권량: ' + result.월발권량);     // 예상: 2천만원~5천만원
    Logger.log('GDS: ' + result.GDS);             // 예상: O
    Logger.log('메인에이전시: ' + result.메인에이전시); // 예상: 하나투어
    Logger.log('메인타겟: ' + result.메인타겟);     // 예상: 인디비
    Logger.log('비고: ' + result.비고);
  } catch (e) {
    Logger.log('에러: ' + e.message);
  }
}
```

- [ ] **Step 3: testParseGeminiResponse 실행 및 확인**

함수 선택 → `testParseGeminiResponse` → ▶️ 실행

예상 출력:
```
펜스 있음 - 월발권량: 2천만원~5천만원
펜스 없음 - 월발권량: 1억원 이상
키 누락 - GDS: ""
```

- [ ] **Step 4: testGeminiService 실행 및 확인**

함수 선택 → `testGeminiService` → ▶️ 실행

예상 출력:
```
월발권량: 2천만원~5천만원
GDS: O
메인에이전시: 하나투어
메인타겟: 인디비
비고: 담당자 김철수 대리 (010-1234-5678). 다음 달 미팅 요청.
```

---

## Task 5: Code.gs (메인 핸들러) 작성

**Files:**
- Modify: `Code.gs`

- [ ] **Step 1: Code.gs 전체 코드 작성**

기존 내용을 모두 지우고 아래 코드로 교체:

```javascript
// Code.gs

/**
 * 구글폼 제출 시 자동 실행되는 메인 핸들러.
 * @param {Object} e onFormSubmit 이벤트 객체
 */
function onFormSubmit(e) {
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000); // 30초 내 잠금 획득 대기. 초과 시 자동 throw.
  } catch (lockErr) {
    Logger.log('잠금 획득 실패 (동시 제출 충돌): ' + lockErr.message);
    throw lockErr;
  }

  try {
    var formData = extractFormData(e);
    Logger.log('폼 데이터 추출 완료 - 거래처명: ' + formData.company + ', 담당자: ' + formData.manager);

    var geminiResult;
    try {
      geminiResult = analyzeConsultation(formData.consultation);
      Logger.log('Gemini 분석 완료');
    } catch (geminiErr) {
      Logger.log('Gemini 분석 실패: ' + geminiErr.message);
      geminiResult = {
        월발권량: '', GDS: '', 메인에이전시: '', 메인타겟: '',
        비고: 'AI 분석 실패 - 원문: ' + formData.consultation
      };
    }

    var props = PropertiesService.getScriptProperties();
    var ss = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
    var sheet = ss.getSheets()[0];

    var targetRow = findFirstEmptyRow(sheet);
    var rowNum = targetRow - 2; // #: 1~2행이 헤더이므로 제외. 중간 빈 행 있으면 중복 가능(알려진 제약).
    var rowData = buildRowData(rowNum, formData, geminiResult);

    writeRowData(sheet, targetRow, rowData);
    Logger.log('CRM 기입 완료: ' + targetRow + '행, 거래처명: ' + formData.company);

  } finally {
    lock.releaseLock();
  }
}

/**
 * 폼 이벤트에서 필요한 데이터를 추출한다.
 * 문항 제목 기준으로 매핑 → 폼 문항 순서가 바뀌어도 안전.
 * 제목이 '담당자', '거래처명', '상담내용'과 정확히 일치해야 함(공백 포함).
 * @param {Object} e onFormSubmit 이벤트
 * @returns {{timestamp: Date, manager: string, company: string, consultation: string}}
 */
function extractFormData(e) {
  var timestamp = e.response.getTimestamp();
  var itemResponses = e.response.getItemResponses();

  var data = { manager: '', company: '', consultation: '' };
  itemResponses.forEach(function(r) {
    var title = r.getItem().getTitle();
    var value = r.getResponse();
    if (title === '담당자') data.manager = value;
    else if (title === '거래처명') data.company = value;
    else if (title === '상담내용') data.consultation = value;
  });

  return {
    timestamp: timestamp,
    manager: data.manager,
    company: data.company,
    consultation: data.consultation
  };
}

/**
 * 시트에 기입할 17개 값 배열을 생성한다 (B열~R열).
 * @param {number} rowNum # 값
 * @param {{timestamp: Date, manager: string, company: string, consultation: string}} formData
 * @param {{월발권량: string, GDS: string, 메인에이전시: string, 메인타겟: string, 비고: string}} geminiResult
 * @returns {Array}
 */
function buildRowData(rowNum, formData, geminiResult) {
  var dateStr = Utilities.formatDate(formData.timestamp, 'Asia/Seoul', 'yyyy-MM-dd');
  var row = new Array(CONFIG.ROW_COL_COUNT).fill('');

  row[CONFIG.COL.NUM]          = rowNum;
  row[CONFIG.COL.COMPANY]      = formData.company;
  row[CONFIG.COL.MANAGER]      = formData.manager;
  row[CONFIG.COL.MEETING_DATE] = dateStr;
  row[CONFIG.COL.MONTHLY_VOL]  = validateDropdown(geminiResult.월발권량, CONFIG.DROPDOWNS.MONTHLY_VOL);
  row[CONFIG.COL.GDS]          = validateDropdown(geminiResult.GDS, CONFIG.DROPDOWNS.GDS);
  row[CONFIG.COL.MAIN_AGENCY]  = validateDropdown(geminiResult.메인에이전시, CONFIG.DROPDOWNS.MAIN_AGENCY);
  row[CONFIG.COL.MAIN_TARGET]  = validateDropdown(geminiResult.메인타겟, CONFIG.DROPDOWNS.MAIN_TARGET);
  row[CONFIG.COL.NOTES]        = geminiResult.비고;

  return row;
}
```

- [ ] **Step 2: 저장**

- [ ] **Step 3: 수동 테스트 함수 추가**

Code.gs 하단에 추가:

```javascript
/**
 * 수동 E2E 테스트: 데이터 파이프라인 전체 검증 (LockService/extractFormData 미포함)
 * ※ LockService 동작과 extractFormData 필드 매핑은 실제 폼 제출로만 검증 가능 (Task 6).
 */
function testFullFlow() {
  var mockFormData = {
    timestamp: new Date(),
    manager: '홍길동',
    company: '테스트여행사',
    consultation: '모두투어 통해서 주로 상용 고객 위주. 월 발권 규모 8천만원 수준. GDS는 Amadeus 사용. 법인 위주 출장 상품 관심.'
  };

  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
  var sheet = ss.getSheets()[0];

  var geminiResult;
  try {
    geminiResult = analyzeConsultation(mockFormData.consultation);
  } catch (e) {
    Logger.log('Gemini 실패, 폴백 사용: ' + e.message);
    geminiResult = {
      월발권량: '', GDS: '', 메인에이전시: '', 메인타겟: '',
      비고: 'AI 분석 실패 - 원문: ' + mockFormData.consultation
    };
  }

  var targetRow = findFirstEmptyRow(sheet);
  var rowNum = targetRow - 2;
  var rowData = buildRowData(rowNum, mockFormData, geminiResult);

  writeRowData(sheet, targetRow, rowData);

  Logger.log('E2E 테스트 완료: ' + targetRow + '행');
  Logger.log('거래처명: ' + rowData[CONFIG.COL.COMPANY]);    // → 테스트여행사
  Logger.log('담당자: ' + rowData[CONFIG.COL.MANAGER]);      // → 홍길동
  Logger.log('월발권량: ' + rowData[CONFIG.COL.MONTHLY_VOL]); // → 5천만원~1억원
  Logger.log('GDS: ' + rowData[CONFIG.COL.GDS]);             // → O
  Logger.log('메인에이전시: ' + rowData[CONFIG.COL.MAIN_AGENCY]); // → 모두투어
  Logger.log('메인타겟: ' + rowData[CONFIG.COL.MAIN_TARGET]); // → 상용
  Logger.log('비고: ' + rowData[CONFIG.COL.NOTES]);
}
```

- [ ] **Step 4: testFullFlow 실행 및 시트 확인**

함수 선택 → `testFullFlow` → ▶️ 실행
- 구글시트 열어서 새 행 추가 확인
- 컬럼 위치와 값이 매핑표와 일치하는지 확인

---

## Task 6: 담당자 드롭다운 동기화 함수 작성

**Files:**
- Modify: `Code.gs`

담당자 목록은 구글시트 `담당자 목록` 탭 A열에서 관리. 목록이 바뀔 때마다 이 함수를 실행하면 폼 드롭다운이 업데이트됨.

- [ ] **Step 1: 구글시트에 `담당자 목록` 탭 생성**

구글시트에서:
1. 하단 "+" 버튼으로 새 시트 추가
2. 탭 이름을 `담당자 목록`으로 변경
3. A1에 `이름` 입력 (헤더)
4. A2부터 담당자 이름 한 줄씩 입력

예:
```
A1: 이름
A2: 홍길동
A3: 김철수
A4: 이영희
```

- [ ] **Step 2: Script Properties에 FORM_ID 추가**

Apps Script 편집기 → 프로젝트 설정 → 스크립트 속성:
- `FORM_ID` = 구글폼 URL의 `/d/` 다음 ~ `/edit` 이전 문자열

- [ ] **Step 3: syncManagerDropdown 함수를 Code.gs에 추가**

Code.gs 하단에 추가:

```javascript
/**
 * 구글시트 '담당자 목록' 탭의 이름 목록을 읽어
 * 구글폼의 '담당자' 드롭다운 선택지를 업데이트한다.
 * 담당자 목록이 변경될 때마다 수동으로 실행.
 */
function syncManagerDropdown() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
  var form = FormApp.openById(props.getProperty('FORM_ID'));

  // 담당자 목록 탭에서 이름 읽기 (A2부터, 헤더 제외)
  var listSheet = ss.getSheetByName('담당자 목록');
  if (!listSheet) throw new Error("'담당자 목록' 시트를 찾을 수 없습니다.");

  var lastRow = listSheet.getLastRow();
  if (lastRow < 2) throw new Error("'담당자 목록' 시트에 이름이 없습니다. A2부터 입력해주세요.");

  var names = listSheet.getRange(2, 1, lastRow - 1, 1).getValues()
    .map(function(row) { return row[0]; })
    .filter(function(name) { return name !== ''; });

  // 폼에서 '담당자' 드롭다운 문항 찾기
  var items = form.getItems(FormApp.ItemType.LIST);
  var managerItem = null;
  for (var i = 0; i < items.length; i++) {
    if (items[i].getTitle() === '담당자') {
      managerItem = items[i].asListItem();
      break;
    }
  }
  if (!managerItem) throw new Error("폼에서 '담당자' 드롭다운 문항을 찾을 수 없습니다.");

  managerItem.setChoiceValues(names);
  Logger.log('담당자 드롭다운 업데이트 완료: ' + names.join(', '));
}
```

- [ ] **Step 4: syncManagerDropdown 실행 및 폼 확인**

함수 선택 → `syncManagerDropdown` → ▶️ 실행
- 처음 실행 시 `FormApp` 권한 추가 승인 필요
- 구글폼 편집기에서 담당자 드롭다운 선택지가 시트 목록과 일치하는지 확인

---

## Task 7: onFormSubmit 트리거 등록 및 최종 검증

- [ ] **Step 1: 트리거 등록** (syncManagerDropdown 완료 후 진행)

Apps Script 편집기 왼쪽 사이드바 → "트리거(⏰)" → 오른쪽 하단 "+ 트리거 추가":
- 실행할 함수: `onFormSubmit`
- 배포에서 실행: `Head`
- 이벤트 소스: `양식에서`
- 이벤트 유형: `양식 제출 시`
- 저장 → 권한 승인

- [ ] **Step 2: 실제 폼 제출 테스트 (extractFormData + LockService 검증)**

구글폼 미리보기(눈 아이콘)에서 입력 후 제출:
- 담당자: 김테스트
- 거래처명: 실제테스트여행사
- 상담내용: 노랑풍선 통해서 동남아 인디비 위주. 월 발권 5천만원 수준. GDS Galileo 사용. 이번달 내 계약 희망.

- [ ] **Step 3: 결과 확인**

1. 구글시트 → 새 행 추가됐는지 확인
2. `담당자` 컬럼(L열)에 "김테스트" 기입됐는지 확인 (extractFormData 매핑 검증)
3. `거래처명` 컬럼(D열)에 "실제테스트여행사" 기입됐는지 확인
4. `메인에이전시`에 "노랑풍선", `메인타겟`에 "인디비" 예상
5. Apps Script → "실행" → "실행 기록"에서 에러 없는지 확인

---

## 에러 대응 가이드

| 증상 | 확인 사항 |
|------|-----------|
| 행이 추가 안 됨 | 실행 기록 에러 확인. SPREADSHEET_ID 재확인 |
| 담당자/거래처명이 엉뚱한 컬럼에 들어감 | 구글폼 문항 제목이 정확히 `담당자`, `거래처명`, `상담내용`인지 확인 (공백, 맞춤법) |
| 드롭다운 컬럼이 빈칸 | 실행 기록에서 Gemini 응답 로그 확인. 상담내용에 관련 정보 포함 여부 확인 |
| "API 오류: HTTP 400" | GEMINI_API_KEY 재확인. AI Studio에서 키 활성화 여부 확인 |
| "Gemini 응답에 candidates 없음" | 상담내용이 Gemini 안전 필터에 걸렸을 가능성. 내용 확인 |
| "권한 없음" 에러 | 트리거 재등록 시 권한 재승인 |
| # 값이 중복 | 시트 중간에 빈 행이 있는지 확인. 빈 행 제거 후 재사용 |
