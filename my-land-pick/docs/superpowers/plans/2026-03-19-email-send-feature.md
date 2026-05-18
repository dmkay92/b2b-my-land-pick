# 안내 메일 발송 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** S열 체크박스로 발송 대기를 표시하고 커스텀 메뉴로 담당자 계정에서 HTML 안내 이메일을 발송하는 기능을 구현한다.

**Architecture:** Apps Script `onEdit` 트리거가 S열 체크박스 변경을 감지해 노란색 하이라이트로 발송 대기를 표시한다. 담당자가 내용 검토 후 커스텀 메뉴 "안내 메일 발송"을 클릭하면 `GmailApp`이 현재 로그인 계정으로 HTML 이메일을 발송하고 S열을 날짜 텍스트로 교체한다. N열 월 발권량 기준으로 기본/대형 두 가지 템플릿이 분기된다.

**Tech Stack:** Google Apps Script, GmailApp, DriveApp, SpreadsheetApp, PropertiesService

---

## 파일 구조

| 파일 | 변경 | 역할 |
|------|------|------|
| `crm-script/Config.gs` | 수정 | `COL.EMAIL_SENT: 17` 추가 |
| `crm-script/EmailService.gs` | 신규 | 템플릿 빌드, 이메일 발송 로직 |
| `crm-script/Code.gs` | 수정 | `onOpen` 메뉴 등록, `onEdit` 하이라이트 핸들러 추가 |

---

### Task 1: Config.gs에 EMAIL_SENT 컬럼 인덱스 추가

**Files:**
- Modify: `crm-script/Config.gs:35`

S열(인덱스 17, 0-based from B)을 `EMAIL_SENT`로 명명한다. 현재 Config.gs의 COL 객체에 S열은 주석으로만 표시돼 있다.

- [ ] **Step 1: Config.gs 열어서 COL 객체 확인**

현재 `crm-script/Config.gs` 의 COL 객체 마지막 부분:
```javascript
    NOTES: 16,        // R: 비고
                      // S: 17 (빈칸)
    VOF_COMPANY: 18   // T: VOF 거래처명
                      // U: 19 (빈칸)
```

- [ ] **Step 2: EMAIL_SENT 추가**

```javascript
    NOTES: 16,        // R: 비고
    EMAIL_SENT: 17,   // S: 안내 메일 발송 일시
    VOF_COMPANY: 18   // T: VOF 거래처명
                      // U: 19 (빈칸)
```

- [ ] **Step 3: 저장 확인**

Apps Script 편집기에서 Config.gs 저장. `CONFIG.COL.EMAIL_SENT` 가 `17` 임을 확인.

---

### Task 2: EmailService.gs 생성 — 이메일 템플릿 빌드

**Files:**
- Create: `crm-script/EmailService.gs`

템플릿 선택 로직과 HTML 본문 빌드 함수를 구현한다. 발송 로직과 분리해 각 함수가 단일 책임을 갖도록 한다.

- [ ] **Step 1: EmailService.gs 파일 생성 후 템플릿 분기 함수 작성**

```javascript
// EmailService.gs

var EMAIL_SUBJECT = '[마이리얼트립] 항공 B2B 홀세일 파트너 관련 안내';

// 5천만원 이상으로 분류되는 월 발권량 값 목록
var HIGH_VOLUME_VALUES = ['5천만원~1억원', '1억원 이상', '2억원 이상'];

/**
 * N열(월 발권량) 값 기준으로 이메일 HTML 본문을 반환한다.
 * 매핑되지 않는 값은 기본 템플릿으로 폴백.
 * @param {string} monthlyVol CONFIG.DROPDOWNS.MONTHLY_VOL 중 하나 또는 빈 문자열
 * @param {string} managerName L열 담당자명
 * @returns {string} HTML 본문
 */
function buildEmailBody(monthlyVol, managerName) {
  var isHighVolume = HIGH_VOLUME_VALUES.indexOf(monthlyVol) !== -1;
  return isHighVolume
    ? buildHighVolumeBody(managerName)
    : buildBasicBody(managerName);
}

/**
 * 기본 템플릿 (5천만원 미만 / 없음/모름 / 비어있음)
 */
function buildBasicBody(managerName) {
  var name = managerName || '담당자';
  return '안녕하세요,<br>' +
    '마이리얼트립 B2B 담당 매니저 <b>' + name + '</b>입니다.<br><br>' +
    '<b>마이리얼트립 항공 홀세일</b>에 관심가져 주셔서 감사드립니다.<br><br>' +
    '마이리얼트립은 올해부터 항공 홀세일 대리점을 본격적으로 확장하며,<br>' +
    '현재 아래와 같은 프로모션을 진행하고 있습니다. (첨부파일 참고 부탁드립니다)<br><br>' +
    '<b>1/ 항공사 제한 없이 발권액의 3% 현금 지급 (외항사 포함, SOTO 포함)</b><br>' +
    '<b>2/ 환불·재발행 수수료 전면 면제 (GDS 사용 파트너사)</b><br>' +
    '<b>3/ KE·OZ 상위 클래스 현금 지급 프로모션 (미주·유럽 노선 - 퍼스트 10만원, 비즈니스 5만원)</b><br>' +
    '<b>4/ 신규·휴면·소개파트너 현금 지급 이벤트 (신규·휴면파트너 - 최대 50만원 / 소개파트너 - 지급액 제한 없음)</b><br><br>' +
    '이에 따라 월 발권액이 <b>5천만 원</b> 규모이실 경우<br>' +
    '월 <b>150만 원</b>, 6개월 기준 약 <b>900만 원의 추가 수익</b>이 발생하며,<br>' +
    '외항사·SOTO 발권, 환불·재발행 수수료 면제, 상위 클래스 프로모션까지 고려하면 <b>실제 체감 혜택은 1,000만 원 이상</b>이 될 것으로 예상됩니다.<br><br>' +
    '마이리얼트립 <b>B2B 홀세일 포털 링크</b>를 전달드립니다. (상세 매뉴얼은 첨부파일 참고 부탁드립니다)<br>' +
    '<b>&gt;&gt; <a href="https://flights-b2b.myrealtrip.com/">https://flights-b2b.myrealtrip.com/</a></b>&nbsp;&nbsp;(회원가입 3분 소요)<br><br>' +
    '(<b>저희 카운터분들</b>과는 <b>카카오톡채널 &gt;&gt; \'<a href="https://pf.kakao.com/_xhxmJZG">마이리얼트립 B2B항공</a>\'</b> 에서 실시간으로 소통하실 수 있습니다.)<br><br>' +
    '추가로 궁금하신 사항이 있으시면 언제든지 편하게 회신 부탁드립니다.<br><br>' +
    '감사합니다<br>' +
    '<b>' + name + '</b> 드림';
}

/**
 * 대형 템플릿 (5천만원 이상)
 */
function buildHighVolumeBody(managerName) {
  var name = managerName || '담당자';
  return '안녕하세요,<br>' +
    '마이리얼트립 B2B 담당 매니저 <b>' + name + '</b>입니다.<br><br>' +
    '<b>마이리얼트립 항공 홀세일</b>에 관심가져 주셔서 감사드립니다.<br><br>' +
    '마이리얼트립은 올해부터 항공 홀세일 대리점을 본격적으로 확장하며,<br>' +
    '현재 아래와 같은 프로모션을 진행하고 있습니다. (첨부파일 참고 부탁드립니다)<br><br>' +
    '<b>1/ 항공사 제한 없이 발권액의 3% 현금 지급 (외항사 포함, SOTO 포함)</b><br>' +
    '<b>2/ 환불·재발행 수수료 전면 면제 (GDS 사용 파트너사)</b><br>' +
    '<b>3/ KE·OZ 상위 클래스 현금 지급 프로모션 (미주·유럽 노선 - 퍼스트 10만원, 비즈니스 5만원)</b><br>' +
    '<b>4/ 신규·휴면·소개파트너 현금 지급 이벤트 (신규·휴면파트너 - 최대 50만원 / 소개파트너 - 지급액 제한 없음)</b><br><br>' +
    '이에 따라 월 발권액이 <b>1억 원</b> 규모이실 경우,<br>' +
    '현재 시장 조건 (2.0%) 대비 월 <b>100만 원</b>, 5개월 기준 약 <b>500만 원의 추가 수익</b>이 발생하며,<br>' +
    '외항사·SOTO 발권, 환불·재발행 수수료 면제, 상위 클래스 프로모션까지 고려하면 <b>실제 체감 혜택은 600만 원 이상</b>이 될 것으로 예상됩니다.<br><br>' +
    '마이리얼트립 <b>B2B 홀세일 포털 링크</b>를 전달드립니다. (상세 매뉴얼은 첨부파일 참고 부탁드립니다)<br>' +
    '<b>&gt;&gt; <a href="https://flights-b2b.myrealtrip.com/">https://flights-b2b.myrealtrip.com/</a></b>&nbsp;&nbsp;(회원가입 3분 소요)<br><br>' +
    '(<b>저희 카운터분들</b>과는 <b>카카오톡채널 &gt;&gt; \'<a href="https://pf.kakao.com/_xhxmJZG">마이리얼트립 B2B항공</a>\'</b> 에서 실시간으로 소통하실 수 있습니다.)<br><br>' +
    '추가로 궁금하신 사항이 있으시면 언제든지 편하게 회신 부탁드립니다.<br><br>' +
    '감사합니다<br>' +
    '<b>' + name + '</b> 드림';
}
```

- [ ] **Step 2: 수동 테스트 함수 추가**

같은 파일 하단에 추가:

```javascript
/**
 * 수동 테스트: 템플릿 분기 확인 (API 키 불필요)
 * Apps Script 편집기에서 직접 실행
 */
function testBuildEmailBody() {
  // 기본 템플릿 케이스들
  Logger.log('=== 기본 템플릿 ===');
  Logger.log(buildEmailBody('', '홍길동').substring(0, 100));        // 빈 문자열
  Logger.log(buildEmailBody('없음/모름', '홍길동').substring(0, 100));
  Logger.log(buildEmailBody('2천만원 이하', '홍길동').substring(0, 100));
  Logger.log(buildEmailBody('2천만원~5천만원', '홍길동').substring(0, 100));
  Logger.log(buildEmailBody('알수없는값', '홍길동').substring(0, 100)); // 폴백 확인

  // 대형 템플릿 케이스들
  Logger.log('=== 대형 템플릿 ===');
  Logger.log(buildEmailBody('5천만원~1억원', '홍길동').substring(0, 100));
  Logger.log(buildEmailBody('1억원 이상', '홍길동').substring(0, 100));
  Logger.log(buildEmailBody('2억원 이상', '홍길동').substring(0, 100));
}
```

- [ ] **Step 3: testBuildEmailBody 실행해서 로그 확인**

Apps Script 편집기에서 `testBuildEmailBody` 실행.
- 기본 케이스 5개: "안녕하세요," + "5천만 원" 포함 확인
- 대형 케이스 3개: "안녕하세요," + "1억 원" 포함 확인

---

### Task 3: EmailService.gs — 이메일 발송 함수 추가

**Files:**
- Modify: `crm-script/EmailService.gs`

단일 행 발송(`sendEmailRow`)과 전체 대기 행 일괄 발송(`sendPendingEmails`)을 구현한다.

- [ ] **Step 1: sendEmailRow 함수 추가**

EmailService.gs 하단에 추가:

```javascript
/**
 * 시트의 특정 행에 안내 메일을 발송한다.
 * @param {Sheet} sheet
 * @param {number} rowNum 1-based 행 번호
 * @returns {boolean} 발송 성공 여부 (이메일 없으면 false)
 */
function sendEmailRow(sheet, rowNum) {
  var rowData = sheet.getRange(rowNum, CONFIG.ROW_START_COL, 1, CONFIG.ROW_COL_COUNT).getValues()[0];

  var email       = rowData[CONFIG.COL.EMAIL];        // G열
  var managerName = rowData[CONFIG.COL.MANAGER];      // L열
  var monthlyVol  = rowData[CONFIG.COL.MONTHLY_VOL];  // N열

  if (!email) {
    Logger.log('이메일 없음 - 스킵: ' + rowNum + '행');
    return false;
  }

  var htmlBody = buildEmailBody(monthlyVol, managerName);

  // 첨부파일 조회 (없으면 첨부 없이 발송)
  var attachments = [];
  var props = PropertiesService.getScriptProperties();
  var fileId = props.getProperty('ATTACHMENT_FILE_ID');
  if (fileId) {
    try {
      attachments = [DriveApp.getFileById(fileId).getBlob()];
    } catch (e) {
      Logger.log('첨부파일 조회 실패 (첨부 없이 발송): ' + e.message);
    }
  }

  var options = { htmlBody: htmlBody };
  if (attachments.length > 0) options.attachments = attachments;

  GmailApp.sendEmail(email, EMAIL_SUBJECT, '', options);
  Logger.log('메일 발송 완료: ' + rowNum + '행 → ' + email);
  return true;
}

/**
 * S열이 체크박스(TRUE)인 모든 행에 메일을 발송하고 발송일시로 교체한다.
 * 커스텀 메뉴에서 호출.
 */
function sendPendingEmails() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
  var sheet = ss.getSheets()[0];

  var lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.DATA_START_ROW) {
    SpreadsheetApp.getUi().alert('발송 대기 중인 항목이 없습니다.');
    return;
  }

  // S열 전체 읽기 (1-based col = ROW_START_COL + EMAIL_SENT = 2 + 17 = 19)
  var sValues = sheet.getRange(CONFIG.DATA_START_ROW, CONFIG.ROW_START_COL + CONFIG.COL.EMAIL_SENT, lastRow - CONFIG.DATA_START_ROW + 1, 1).getValues();

  // TRUE인 행(체크박스 체크) 수집
  var pendingRows = [];
  for (var i = 0; i < sValues.length; i++) {
    if (sValues[i][0] === true) {
      pendingRows.push(CONFIG.DATA_START_ROW + i);
    }
  }

  if (pendingRows.length === 0) {
    SpreadsheetApp.getUi().alert('발송 대기 중인 항목이 없습니다.');
    return;
  }

  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    '안내 메일 발송',
    pendingRows.length + '건의 안내 메일을 발송하시겠습니까?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var dateStr = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var skipped = [];

  for (var j = 0; j < pendingRows.length; j++) {
    var rowNum = pendingRows[j];
    var sent = sendEmailRow(sheet, rowNum);

    // S열 처리: 발송 성공이면 날짜, 실패(이메일 없음)면 체크박스 해제
    var sCell = sheet.getRange(rowNum, CONFIG.ROW_START_COL + CONFIG.COL.EMAIL_SENT);
    if (sent) {
      sCell.setValue(dateStr);
      sCell.setBackground(null); // 하이라이트 제거
    } else {
      sCell.setValue(false);
      sCell.setBackground(null);
      skipped.push(rowNum);
    }
  }

  var msg = (pendingRows.length - skipped.length) + '건 발송 완료.';
  if (skipped.length > 0) {
    msg += '\n이메일 없어 스킵된 행: ' + skipped.join(', ');
  }
  ui.alert(msg);
}
```

- [ ] **Step 2: 수동 테스트 함수 추가 (실제 발송 없이 로직 확인)**

```javascript
/**
 * 수동 테스트: sendPendingEmails 호출 전 대기 행 목록 확인
 * 실제 발송 없이 어떤 행이 처리될지 확인
 */
function testPendingRows() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
  var sheet = ss.getSheets()[0];
  var lastRow = sheet.getLastRow();

  if (lastRow < CONFIG.DATA_START_ROW) {
    Logger.log('데이터 없음');
    return;
  }

  var sValues = sheet.getRange(CONFIG.DATA_START_ROW, CONFIG.ROW_START_COL + CONFIG.COL.EMAIL_SENT, lastRow - CONFIG.DATA_START_ROW + 1, 1).getValues();
  var count = 0;
  for (var i = 0; i < sValues.length; i++) {
    if (sValues[i][0] === true) {
      Logger.log('대기 행: ' + (CONFIG.DATA_START_ROW + i) + '행');
      count++;
    }
  }
  Logger.log('총 대기: ' + count + '건');
}
```

---

### Task 4: Code.gs — onOpen 커스텀 메뉴 등록

**Files:**
- Modify: `crm-script/Code.gs` (파일 최상단에 추가)

시트를 열 때마다 "안내 메일 발송" 메뉴를 등록한다.

- [ ] **Step 1: Code.gs 최상단(1행 앞)에 onOpen 추가**

`// Code.gs` 주석 바로 아래에 삽입:

```javascript
/**
 * 스프레드시트 열릴 때 커스텀 메뉴를 등록한다.
 * Apps Script 편집기에서 트리거로 등록하거나 시트를 다시 열면 메뉴가 나타난다.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📧 메일 발송')
    .addItem('안내 메일 발송', 'sendPendingEmails')
    .addToUi();
}
```

- [ ] **Step 2: 저장 후 시트 새로고침**

Apps Script 저장 → 구글시트 탭 새로고침 → 상단 메뉴에 "📧 메일 발송" 항목 확인.

---

### Task 5: Code.gs — onEdit 핸들러 추가 (하이라이트)

**Files:**
- Modify: `crm-script/Code.gs`

S열 체크박스를 체크하면 해당 행을 노란색으로, 체크 해제하면 원래대로 돌린다. **이 함수는 installable trigger로 등록해야 한다** (simple onEdit은 다른 스크립트 서비스 접근 불가).

- [ ] **Step 1: onEdit 함수 추가**

`onOpen` 함수 바로 아래에 추가:

```javascript
/**
 * 셀 편집 시 호출되는 �핸들러.
 * S열(EMAIL_SENT) 체크박스 변경만 처리한다.
 *
 * ※ 주의: Apps Script 편집기 > 트리거 메뉴에서
 *   "onEdit" 함수를 "스프레드시트 편집 시" 이벤트로 installable trigger 등록 필요.
 *   simple trigger로는 배경색 변경이 동작하지 않을 수 있음.
 *
 * @param {Object} e onEdit 이벤트 객체
 */
function onEdit(e) {
  var range = e.range;
  var sheet = range.getSheet();

  // 첫 번째 시트(CRM 시트)만 처리
  if (sheet.getIndex() !== 1) return;

  // S열 여부 확인 (1-based: B=2, S = ROW_START_COL + COL.EMAIL_SENT)
  var sCol = CONFIG.ROW_START_COL + CONFIG.COL.EMAIL_SENT; // = 2 + 17 = 19
  if (range.getColumn() !== sCol) return;

  // DATA_START_ROW 이상 행만 처리
  if (range.getRow() < CONFIG.DATA_START_ROW) return;

  var value = e.value; // 체크박스: "TRUE" 또는 "FALSE" (문자열)
  var rowRange = sheet.getRange(range.getRow(), CONFIG.ROW_START_COL, 1, CONFIG.ROW_COL_COUNT);

  if (value === 'TRUE') {
    rowRange.setBackground('#FFF9C4'); // 연한 노란색
  } else {
    rowRange.setBackground(null); // 배경색 초기화
  }
}
```

- [ ] **Step 2: installable trigger 등록**

1. Apps Script 편집기 좌측 메뉴 "트리거 (시계 아이콘)" 클릭
2. 우하단 "+ 트리거 추가" 클릭
3. 설정:
   - 실행할 함수: `onEdit`
   - 이벤트 소스: `스프레드시트`
   - 이벤트 유형: `편집 시`
4. 저장 → 권한 승인

- [ ] **Step 3: 동작 확인**

구글시트에서 S열의 빈 셀에 체크박스 삽입 후 체크 → 해당 행 노란색 확인.
체크 해제 → 배경색 원복 확인.

---

### Task 6: Script Properties에 ATTACHMENT_FILE_ID 등록

**Files:**
- 없음 (Apps Script 편집기 설정)

- [ ] **Step 1: 구글 드라이브에 첨부파일 업로드**

월별 첨부파일(PDF 등)을 구글 드라이브에 업로드.

- [ ] **Step 2: 파일 ID 복사**

업로드된 파일 우클릭 → "링크 복사" → URL에서 ID 추출
(예: `https://drive.google.com/file/d/[FILE_ID]/view` 에서 `[FILE_ID]` 부분)

- [ ] **Step 3: Script Properties에 등록**

Apps Script 편집기 → 프로젝트 설정(⚙️) → 스크립트 속성 → 속성 추가:
- 속성: `ATTACHMENT_FILE_ID`
- 값: 복사한 파일 ID

- [ ] **Step 4: 파일 공유 권한 확인**

드라이브 파일이 "링크가 있는 사용자 모두" 또는 스크립트 실행 계정에 공유돼 있어야 DriveApp이 접근 가능.

---

### Task 7: 전체 E2E 테스트

- [ ] **Step 1: 테스트용 행 준비**

시트 3행 이후 임의 행에:
- G열: 본인 이메일 주소 입력
- L열: 담당자명 입력
- N열: 드롭다운에서 값 선택 (기본/대형 각각 테스트)

- [ ] **Step 2: S열 체크박스 삽입**

해당 행 S열 셀 선택 → 삽입 메뉴 → 체크박스

- [ ] **Step 3: 체크박스 체크 → 하이라이트 확인**

S열 체크박스 체크 → 행 배경 노란색 확인.

- [ ] **Step 4: 커스텀 메뉴로 발송**

상단 "📧 메일 발송" → "안내 메일 발송" 클릭 → 다이얼로그 확인 → "예" 클릭.

- [ ] **Step 5: 결과 확인**

- 본인 이메일 수신 확인 (제목, HTML bold, 링크, 첨부파일)
- S열이 `yyyy-MM-dd` 날짜 텍스트로 교체됐는지 확인
- 행 배경색 초기화 확인

- [ ] **Step 6: 엣지 케이스 확인**

- G열 이메일 비어있는 행 체크 → 발송 스킵 + 알림 메시지 확인
- 이미 날짜 텍스트가 있는 S열 → 메뉴 눌러도 재발송 안 됨 확인 (체크박스가 TRUE가 아니므로 자동 스킵)
