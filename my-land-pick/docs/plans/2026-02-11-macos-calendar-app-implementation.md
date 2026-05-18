# macOS 캘린더 앱 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** macOS용 독립형 캘린더 데스크톱 앱 구축 (이벤트 관리, 반복 이벤트, 알림, 검색, 테마 지원)

**Architecture:** 3계층 구조 (UI/비즈니스로직/데이터). Electron으로 데스크톱 앱 래핑, Toast UI Calendar로 UI 렌더링, SQLite로 로컬 데이터 저장.

**Tech Stack:** Electron 28+, Toast UI Calendar 2.x, better-sqlite3, 순수 HTML/CSS/JavaScript (프레임워크 없음)

---

## Phase 1: 프로젝트 초기화 및 기본 구조

### Task 1: 프로젝트 초기화

**Files:**
- Create: `package.json`
- Create: `.gitignore`

**Step 1: package.json 생성**

```bash
npm init -y
```

**Step 2: package.json 수정**

```json
{
  "name": "macos-calendar-app",
  "version": "1.0.0",
  "description": "macOS standalone calendar application",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev"
  },
  "keywords": ["calendar", "electron", "macos"],
  "author": "Kay",
  "license": "MIT"
}
```

**Step 3: .gitignore 생성**

```
node_modules/
data/*.db
data/*.db-journal
.DS_Store
dist/
*.log
```

**Step 4: 의존성 설치**

```bash
npm install electron@^28.0.0 --save-dev
npm install @toast-ui/calendar@^2.1.0
npm install better-sqlite3@^9.0.0
npm install uuid@^9.0.0
```

Expected: 패키지 설치 성공, node_modules/ 폴더 생성

**Step 5: 커밋**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: initialize project with dependencies

- Add Electron 28 for desktop app framework
- Add Toast UI Calendar 2.x for calendar UI
- Add better-sqlite3 for local database
- Add uuid for unique ID generation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 2: 디렉토리 구조 생성

**Files:**
- Create: `src/index.html`
- Create: `src/renderer.js`
- Create: `src/css/main.css`
- Create: `src/css/themes.css`
- Create: `src/css/calendar.css`
- Create: `src/js/database.js`
- Create: `src/js/events.js`
- Create: `src/js/recurrence.js`
- Create: `src/js/notifications.js`
- Create: `src/js/search.js`
- Create: `src/js/settings.js`
- Create: `main.js`

**Step 1: 디렉토리 생성**

```bash
mkdir -p src/css src/js src/assets/icons data
```

**Step 2: 빈 파일 생성 (플레이스홀더)**

```bash
touch main.js
touch src/index.html src/renderer.js
touch src/css/main.css src/css/themes.css src/css/calendar.css
touch src/js/database.js src/js/events.js src/js/recurrence.js
touch src/js/notifications.js src/js/search.js src/js/settings.js
```

**Step 3: 커밋**

```bash
git add main.js src/
git commit -m "chore: create project directory structure

Create source directories and placeholder files:
- main.js: Electron main process
- src/index.html: Main window HTML
- src/renderer.js: Main UI logic
- src/css/: Stylesheets (main, themes, calendar)
- src/js/: Business logic modules

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 3: Electron 메인 프로세스 구현

**Files:**
- Modify: `main.js`

**Step 1: main.js 기본 구조 작성**

```javascript
// main.js
// Electron 메인 프로세스: 앱 초기화 및 윈도우 관리

const { app, BrowserWindow, Menu, Tray, nativeImage } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;

// 앱 준비 완료 시 윈도우 생성
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    // macOS: Dock 아이콘 클릭 시 윈도우 재생성
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 모든 윈도우가 닫혔을 때
app.on('window-all-closed', () => {
  // macOS: Cmd+Q로 명시적으로 종료하지 않으면 앱 유지
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 메인 윈도우 생성
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    titleBarStyle: 'hiddenInset', // macOS 스타일
    show: false // 로딩 후 표시
  });

  // HTML 로드
  mainWindow.loadFile('src/index.html');

  // 로딩 완료 후 윈도우 표시
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 개발 모드: DevTools 자동 열기
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // 윈도우 닫기 이벤트: 완전 종료 대신 숨김
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// 메뉴바 트레이 아이콘 생성
function createTray() {
  // 임시 아이콘 (나중에 실제 아이콘으로 교체)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '캘린더 열기',
      click: () => {
        mainWindow.show();
      }
    },
    { type: 'separator' },
    {
      label: '완전 종료',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('캘린더 앱');

  // 트레이 아이콘 클릭 시 윈도우 토글
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
}
```

**Step 2: 앱 실행 테스트**

Run: `npm start`

Expected: Electron 윈도우가 열리지만 빈 화면 (index.html이 비어있음)

**Step 3: 커밋**

```bash
git add main.js
git commit -m "feat: implement Electron main process

- Create main window with macOS native titlebar
- Add tray icon for background running
- Support hide on close (not quit)
- Enable DevTools in dev mode
- Handle macOS app lifecycle

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 4: 기본 HTML 구조 작성

**Files:**
- Modify: `src/index.html`

**Step 1: index.html 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>캘린더</title>

  <!-- Toast UI Calendar CSS -->
  <link rel="stylesheet" href="../node_modules/@toast-ui/calendar/dist/toastui-calendar.min.css" />

  <!-- 커스텀 CSS -->
  <link rel="stylesheet" href="css/main.css">
  <link rel="stylesheet" href="css/themes.css">
  <link rel="stylesheet" href="css/calendar.css">
</head>
<body data-theme="light">

  <!-- 헤더 -->
  <header class="header">
    <div class="nav-section">
      <button id="btn-prev" class="btn-icon" title="이전">◀</button>
      <button id="btn-today" class="btn-primary">오늘</button>
      <button id="btn-next" class="btn-icon" title="다음">▶</button>
      <h2 id="calendar-title" class="calendar-title">2026년 2월</h2>
    </div>

    <div class="view-section">
      <div class="btn-group">
        <button id="btn-month" class="btn-view active">월간</button>
        <button id="btn-week" class="btn-view">주간</button>
        <button id="btn-day" class="btn-view">일간</button>
      </div>
    </div>

    <div class="action-section">
      <button id="btn-search" class="btn-icon" title="검색">🔍</button>
      <button id="btn-settings" class="btn-icon" title="설정">⚙️</button>
    </div>
  </header>

  <!-- 검색 바 (토글) -->
  <div id="search-bar" class="search-bar hidden">
    <input
      type="text"
      id="search-input"
      class="search-input"
      placeholder="이벤트 검색..."
    />
    <button id="btn-close-search" class="btn-icon">✕</button>
    <div id="search-results" class="search-results"></div>
  </div>

  <!-- 캘린더 영역 -->
  <main class="calendar-container">
    <div id="calendar"></div>
  </main>

  <!-- 푸터 -->
  <footer class="footer">
    <button id="btn-new-event" class="btn-primary">+ 새 이벤트</button>
  </footer>

  <!-- 이벤트 생성/수정 모달 -->
  <div id="event-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modal-title">새 이벤트</h3>
        <button id="btn-close-modal" class="btn-icon">✕</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label for="event-title">제목 *</label>
          <input type="text" id="event-title" class="form-input" required />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="event-start-date">시작 날짜</label>
            <input type="date" id="event-start-date" class="form-input" />
          </div>
          <div class="form-group">
            <label for="event-start-time">시작 시간</label>
            <input type="time" id="event-start-time" class="form-input" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="event-end-date">종료 날짜</label>
            <input type="date" id="event-end-date" class="form-input" />
          </div>
          <div class="form-group">
            <label for="event-end-time">종료 시간</label>
            <input type="time" id="event-end-time" class="form-input" />
          </div>
        </div>

        <div class="form-group">
          <label for="event-description">설명</label>
          <textarea id="event-description" class="form-input" rows="3"></textarea>
        </div>

        <div class="form-group">
          <label for="event-location">장소</label>
          <input type="text" id="event-location" class="form-input" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="event-category">카테고리</label>
            <select id="event-category" class="form-input">
              <option value="개인">개인</option>
              <option value="업무">업무</option>
              <option value="가족">가족</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div class="form-group">
            <label>색상</label>
            <div class="color-picker">
              <button class="color-btn" data-color="#4285F4" style="background: #4285F4;"></button>
              <button class="color-btn" data-color="#EA4335" style="background: #EA4335;"></button>
              <button class="color-btn" data-color="#34A853" style="background: #34A853;"></button>
              <button class="color-btn" data-color="#9E9E9E" style="background: #9E9E9E;"></button>
            </div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="event-recurrence">반복</label>
            <select id="event-recurrence" class="form-input">
              <option value="none">없음</option>
              <option value="daily">매일</option>
              <option value="weekly">매주</option>
              <option value="monthly">매월</option>
              <option value="yearly">매년</option>
            </select>
          </div>
          <div class="form-group">
            <label for="event-reminder">알림</label>
            <select id="event-reminder" class="form-input">
              <option value="0">알림 없음</option>
              <option value="0">이벤트 시작 시</option>
              <option value="5">5분 전</option>
              <option value="15" selected>15분 전</option>
              <option value="30">30분 전</option>
              <option value="60">1시간 전</option>
              <option value="1440">1일 전</option>
            </select>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button id="btn-cancel" class="btn-secondary">취소</button>
        <button id="btn-save" class="btn-primary">저장</button>
      </div>
    </div>
  </div>

  <!-- 설정 모달 -->
  <div id="settings-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>설정</h3>
        <button id="btn-close-settings" class="btn-icon">✕</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label>테마</label>
          <select id="setting-theme" class="form-input">
            <option value="light">라이트</option>
            <option value="dark">다크</option>
            <option value="auto">자동 (시스템 설정 따라가기)</option>
          </select>
        </div>

        <div class="form-group">
          <label>기본 뷰</label>
          <select id="setting-default-view" class="form-input">
            <option value="month">월간</option>
            <option value="week">주간</option>
            <option value="day">일간</option>
          </select>
        </div>

        <div class="form-group">
          <label>주 시작일</label>
          <select id="setting-week-start" class="form-input">
            <option value="0">일요일</option>
            <option value="1">월요일</option>
          </select>
        </div>
      </div>

      <div class="modal-footer">
        <button id="btn-save-settings" class="btn-primary">저장</button>
      </div>
    </div>
  </div>

  <!-- Toast UI Calendar -->
  <script src="../node_modules/@toast-ui/calendar/dist/toastui-calendar.min.js"></script>

  <!-- 비즈니스 로직 모듈 -->
  <script src="js/database.js"></script>
  <script src="js/events.js"></script>
  <script src="js/recurrence.js"></script>
  <script src="js/notifications.js"></script>
  <script src="js/search.js"></script>
  <script src="js/settings.js"></script>

  <!-- 메인 렌더러 -->
  <script src="renderer.js"></script>
</body>
</html>
```

**Step 2: 앱 실행 테스트**

Run: `npm start`

Expected: 헤더, 푸터, 모달 구조가 보이지만 스타일 없음 (CSS 미작성)

**Step 3: 커밋**

```bash
git add src/index.html
git commit -m "feat: create main HTML structure

- Add header with navigation and view controls
- Add search bar with toggle visibility
- Add calendar container
- Add footer with new event button
- Add event create/edit modal
- Add settings modal
- Include Toast UI Calendar library

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 5: 기본 CSS 스타일 작성

**Files:**
- Modify: `src/css/main.css`

**Step 1: main.css 작성**

```css
/* src/css/main.css */
/* 기본 스타일 및 레이아웃 */

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: background-color 0.3s, color 0.3s;
}

/* 헤더 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  gap: 20px;
}

.nav-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.calendar-title {
  font-size: 18px;
  font-weight: 600;
  margin-left: 12px;
}

.view-section {
  flex: 1;
  display: flex;
  justify-content: center;
}

.btn-group {
  display: flex;
  gap: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.btn-view {
  padding: 6px 16px;
  background: var(--bg-primary);
  border: none;
  border-right: 1px solid var(--border-color);
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.2s;
}

.btn-view:last-child {
  border-right: none;
}

.btn-view:hover {
  background: var(--bg-hover);
}

.btn-view.active {
  background: var(--accent-color);
  color: white;
}

.action-section {
  display: flex;
  gap: 8px;
}

/* 버튼 스타일 */
.btn-primary {
  padding: 8px 16px;
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-secondary {
  padding: 8px 16px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-secondary:hover {
  background: var(--bg-hover);
}

.btn-icon {
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-icon:hover {
  background: var(--bg-hover);
}

/* 검색 바 */
.search-bar {
  padding: 12px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-bar.hidden {
  display: none;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.search-results {
  position: absolute;
  top: 100%;
  left: 20px;
  right: 20px;
  max-height: 300px;
  overflow-y: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-top: 4px;
  z-index: 100;
  display: none;
}

.search-results.visible {
  display: block;
}

/* 캘린더 컨테이너 */
.calendar-container {
  flex: 1;
  overflow: hidden;
  padding: 20px;
}

#calendar {
  height: 100%;
}

/* 푸터 */
.footer {
  padding: 12px 20px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: center;
}

/* 모달 */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal.hidden {
  display: none;
}

.modal-content {
  background: var(--bg-primary);
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  font-size: 18px;
  font-weight: 600;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
}

/* 폼 스타일 */
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-input,
.form-input:focus {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-row .form-group {
  flex: 1;
}

/* 색상 선택 */
.color-picker {
  display: flex;
  gap: 8px;
}

.color-btn {
  width: 32px;
  height: 32px;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.color-btn:hover,
.color-btn.active {
  border-color: var(--text-primary);
}
```

**Step 2: 앱 실행 테스트**

Run: `npm start`

Expected: 레이아웃이 정상적으로 보이지만 테마 색상이 적용되지 않음

**Step 3: 커밋**

```bash
git add src/css/main.css
git commit -m "style: add main CSS styles

- Layout structure (header, main, footer)
- Button styles (primary, secondary, icon)
- Modal styles with backdrop
- Form input styles
- Search bar styles
- Responsive flexbox layout

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 6: 테마 CSS 작성

**Files:**
- Modify: `src/css/themes.css`

**Step 1: themes.css 작성**

```css
/* src/css/themes.css */
/* 라이트/다크 테마 색상 정의 */

/* 라이트 테마 (기본) */
:root,
[data-theme="light"] {
  --bg-primary: #FFFFFF;
  --bg-secondary: #F5F5F5;
  --bg-hover: #EEEEEE;
  --text-primary: #212121;
  --text-secondary: #757575;
  --border-color: #E0E0E0;
  --accent-color: #4285F4;
}

/* 다크 테마 */
[data-theme="dark"] {
  --bg-primary: #1E1E1E;
  --bg-secondary: #2D2D2D;
  --bg-hover: #3D3D3D;
  --text-primary: #FFFFFF;
  --text-secondary: #B0B0B0;
  --border-color: #404040;
  --accent-color: #8AB4F8;
}
```

**Step 2: 앱 실행 테스트**

Run: `npm start`

Expected: 라이트 테마로 정상 표시

**Step 3: 커밋**

```bash
git add src/css/themes.css
git commit -m "style: add light/dark theme colors

- Define CSS variables for theming
- Light theme: white background, dark text
- Dark theme: dark background, light text
- Support smooth color transitions

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: 데이터베이스 설정

### Task 7: 데이터베이스 모듈 구현

**Files:**
- Modify: `src/js/database.js`

**Step 1: database.js 작성**

```javascript
// src/js/database.js
// SQLite 데이터베이스 관리

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 데이터베이스 파일 경로
const dbPath = path.join(__dirname, '../../data/calendar.db');

// data 디렉토리가 없으면 생성
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 데이터베이스 연결
const db = new Database(dbPath);

// WAL 모드 활성화 (성능 향상)
db.pragma('journal_mode = WAL');

// 테이블 초기화
function initDatabase() {
  // events 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      location TEXT,
      category TEXT,
      color TEXT,
      is_recurring INTEGER DEFAULT 0,
      recurrence_rule TEXT,
      parent_event_id TEXT,
      reminder_minutes INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // settings 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // 기본 설정 추가
  const defaultSettings = [
    { key: 'theme', value: 'light' },
    { key: 'defaultView', value: 'month' },
    { key: 'weekStart', value: '0' }
  ];

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );

  for (const setting of defaultSettings) {
    insertSetting.run(setting.key, setting.value);
  }

  console.log('✓ 데이터베이스 초기화 완료');
}

// 앱 시작 시 데이터베이스 초기화
initDatabase();

// 데이터베이스 객체 내보내기
module.exports = db;
```

**Step 2: 테스트**

Run: `npm start`

Expected:
- 앱 실행 시 콘솔에 "✓ 데이터베이스 초기화 완료" 메시지
- `data/calendar.db` 파일 생성됨

**Step 3: 데이터베이스 확인**

```bash
ls -la data/
```

Expected: `calendar.db`, `calendar.db-shm`, `calendar.db-wal` 파일 존재

**Step 4: 커밋**

```bash
git add src/js/database.js
git commit -m "feat: implement SQLite database module

- Initialize database with events and settings tables
- Create data directory if not exists
- Enable WAL mode for performance
- Set default settings on first run

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: Toast UI Calendar 통합

### Task 8: 캘린더 초기화 및 렌더링

**Files:**
- Modify: `src/renderer.js`
- Modify: `src/css/calendar.css`

**Step 1: renderer.js 기본 구조 작성**

```javascript
// src/renderer.js
// 메인 UI 로직 및 이벤트 핸들러

// Toast UI Calendar 인스턴스
let calendar = null;

// 현재 선택된 뷰
let currentView = 'month';

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', () => {
  initCalendar();
  setupEventListeners();
  console.log('✓ 렌더러 초기화 완료');
});

// 캘린더 초기화
function initCalendar() {
  const calendarEl = document.getElementById('calendar');

  calendar = new tui.Calendar(calendarEl, {
    defaultView: 'month',
    useCreationPopup: false, // 기본 팝업 비활성화
    useDetailPopup: false,   // 커스텀 모달 사용
    isReadOnly: false,
    usageStatistics: false,
    week: {
      startDayOfWeek: 0, // 0: 일요일, 1: 월요일
      dayNames: ['일', '월', '화', '수', '목', '금', '토'],
      hourStart: 0,
      hourEnd: 24
    },
    month: {
      dayNames: ['일', '월', '화', '수', '목', '금', '토']
    },
    template: {
      time(event) {
        return `<span style="color: white;">${event.title}</span>`;
      },
      allday(event) {
        return `<span style="color: white;">${event.title}</span>`;
      }
    }
  });

  updateCalendarTitle();
}

// 이벤트 리스너 설정
function setupEventListeners() {
  // 네비게이션
  document.getElementById('btn-prev').addEventListener('click', () => {
    calendar.prev();
    updateCalendarTitle();
  });

  document.getElementById('btn-today').addEventListener('click', () => {
    calendar.today();
    updateCalendarTitle();
  });

  document.getElementById('btn-next').addEventListener('click', () => {
    calendar.next();
    updateCalendarTitle();
  });

  // 뷰 전환
  document.getElementById('btn-month').addEventListener('click', () => {
    changeView('month');
  });

  document.getElementById('btn-week').addEventListener('click', () => {
    changeView('week');
  });

  document.getElementById('btn-day').addEventListener('click', () => {
    changeView('day');
  });

  // 새 이벤트 버튼
  document.getElementById('btn-new-event').addEventListener('click', () => {
    openEventModal();
  });

  // 모달 닫기
  document.getElementById('btn-close-modal').addEventListener('click', () => {
    closeEventModal();
  });

  document.getElementById('btn-cancel').addEventListener('click', () => {
    closeEventModal();
  });

  // 검색
  document.getElementById('btn-search').addEventListener('click', () => {
    toggleSearch();
  });

  document.getElementById('btn-close-search').addEventListener('click', () => {
    toggleSearch();
  });

  // 설정
  document.getElementById('btn-settings').addEventListener('click', () => {
    openSettingsModal();
  });

  document.getElementById('btn-close-settings').addEventListener('click', () => {
    closeSettingsModal();
  });
}

// 뷰 변경
function changeView(view) {
  calendar.changeView(view);
  currentView = view;

  // 버튼 활성화 상태 업데이트
  document.querySelectorAll('.btn-view').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`btn-${view}`).classList.add('active');

  updateCalendarTitle();
}

// 캘린더 제목 업데이트
function updateCalendarTitle() {
  const date = calendar.getDate();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  let title = '';
  switch (currentView) {
    case 'month':
      title = `${year}년 ${month}월`;
      break;
    case 'week':
      title = `${year}년 ${month}월 ${day}일 주`;
      break;
    case 'day':
      title = `${year}년 ${month}월 ${day}일`;
      break;
  }

  document.getElementById('calendar-title').textContent = title;
}

// 이벤트 모달 열기
function openEventModal() {
  document.getElementById('event-modal').classList.remove('hidden');
}

// 이벤트 모달 닫기
function closeEventModal() {
  document.getElementById('event-modal').classList.add('hidden');
  // 폼 초기화
  document.getElementById('event-title').value = '';
  document.getElementById('event-description').value = '';
  document.getElementById('event-location').value = '';
}

// 검색 토글
function toggleSearch() {
  document.getElementById('search-bar').classList.toggle('hidden');
}

// 설정 모달 열기
function openSettingsModal() {
  document.getElementById('settings-modal').classList.remove('hidden');
}

// 설정 모달 닫기
function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}
```

**Step 2: calendar.css 작성**

```css
/* src/css/calendar.css */
/* Toast UI Calendar 커스텀 스타일 */

/* 캘린더 컨테이너 */
.toastui-calendar-template-time {
  color: white !important;
}

/* 오늘 날짜 강조 */
.toastui-calendar-today {
  background-color: var(--accent-color) !important;
  color: white !important;
}

/* 이벤트 스타일 */
.toastui-calendar-event {
  border-radius: 4px;
}

/* 주말 색상 */
.toastui-calendar-saturday {
  color: #4285F4;
}

.toastui-calendar-sunday {
  color: #EA4335;
}

/* 다크 모드에서 캘린더 배경 */
[data-theme="dark"] .toastui-calendar-month,
[data-theme="dark"] .toastui-calendar-week,
[data-theme="dark"] .toastui-calendar-day {
  background-color: var(--bg-secondary);
  color: var(--text-primary);
}

[data-theme="dark"] .toastui-calendar-weekday,
[data-theme="dark"] .toastui-calendar-day-view,
[data-theme="dark"] .toastui-calendar-week-view {
  background-color: var(--bg-primary);
  border-color: var(--border-color);
}
```

**Step 3: 앱 실행 테스트**

Run: `npm start`

Expected:
- Toast UI Calendar가 월간 뷰로 표시됨
- 헤더의 "월간" 버튼이 활성화됨
- 네비게이션 버튼 (이전/오늘/다음) 작동
- 뷰 전환 버튼 작동 (월간/주간/일간)
- 모달 열기/닫기 작동

**Step 4: 커밋**

```bash
git add src/renderer.js src/css/calendar.css
git commit -m "feat: integrate Toast UI Calendar

- Initialize calendar with month/week/day views
- Add navigation controls (prev/today/next)
- Add view switching buttons
- Add modal open/close handlers
- Update calendar title dynamically
- Customize calendar styles for light/dark themes

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 4: 이벤트 관리 (CRUD)

### Task 9: 이벤트 CRUD 모듈 구현

**Files:**
- Modify: `src/js/events.js`

**Step 1: events.js 작성**

```javascript
// src/js/events.js
// 이벤트 CRUD 작업

const db = require('./database');
const { v4: uuidv4 } = require('uuid');

// 모든 이벤트 가져오기
function getAllEvents() {
  const stmt = db.prepare('SELECT * FROM events ORDER BY start_date ASC');
  return stmt.all();
}

// 특정 기간의 이벤트 가져오기
function getEventsByDateRange(startDate, endDate) {
  const stmt = db.prepare(`
    SELECT * FROM events
    WHERE start_date <= ? AND end_date >= ?
    ORDER BY start_date ASC
  `);
  return stmt.all(endDate, startDate);
}

// 이벤트 ID로 가져오기
function getEventById(id) {
  const stmt = db.prepare('SELECT * FROM events WHERE id = ?');
  return stmt.get(id);
}

// 이벤트 생성
function createEvent(eventData) {
  const now = new Date().toISOString();
  const id = uuidv4();

  const stmt = db.prepare(`
    INSERT INTO events (
      id, title, description, start_date, end_date,
      location, category, color, is_recurring, recurrence_rule,
      parent_event_id, reminder_minutes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    eventData.title,
    eventData.description || null,
    eventData.startDate,
    eventData.endDate,
    eventData.location || null,
    eventData.category || '기타',
    eventData.color || '#9E9E9E',
    eventData.isRecurring ? 1 : 0,
    eventData.recurrenceRule ? JSON.stringify(eventData.recurrenceRule) : null,
    eventData.parentEventId || null,
    eventData.reminderMinutes || null,
    now,
    now
  );

  console.log('✓ 이벤트 생성:', id);
  return id;
}

// 이벤트 수정
function updateEvent(id, eventData) {
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE events SET
      title = ?,
      description = ?,
      start_date = ?,
      end_date = ?,
      location = ?,
      category = ?,
      color = ?,
      is_recurring = ?,
      recurrence_rule = ?,
      parent_event_id = ?,
      reminder_minutes = ?,
      updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    eventData.title,
    eventData.description || null,
    eventData.startDate,
    eventData.endDate,
    eventData.location || null,
    eventData.category || '기타',
    eventData.color || '#9E9E9E',
    eventData.isRecurring ? 1 : 0,
    eventData.recurrenceRule ? JSON.stringify(eventData.recurrenceRule) : null,
    eventData.parentEventId || null,
    eventData.reminderMinutes || null,
    now,
    id
  );

  console.log('✓ 이벤트 수정:', id);
}

// 이벤트 삭제
function deleteEvent(id) {
  const stmt = db.prepare('DELETE FROM events WHERE id = ?');
  stmt.run(id);

  console.log('✓ 이벤트 삭제:', id);
}

// 반복 이벤트의 모든 자식 이벤트 삭제
function deleteRecurringEventAndChildren(parentId) {
  const stmt = db.prepare('DELETE FROM events WHERE id = ? OR parent_event_id = ?');
  stmt.run(parentId, parentId);

  console.log('✓ 반복 이벤트 및 자식 삭제:', parentId);
}

// 카테고리별 색상 매핑
const categoryColors = {
  '개인': '#4285F4',
  '업무': '#EA4335',
  '가족': '#34A853',
  '기타': '#9E9E9E'
};

// 카테고리 색상 가져오기
function getCategoryColor(category) {
  return categoryColors[category] || '#9E9E9E';
}

// 모듈 내보내기
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAllEvents,
    getEventsByDateRange,
    getEventById,
    createEvent,
    updateEvent,
    deleteEvent,
    deleteRecurringEventAndChildren,
    getCategoryColor,
    categoryColors
  };
}
```

**Step 2: 커밋**

```bash
git add src/js/events.js
git commit -m "feat: implement event CRUD operations

- Add getAllEvents and getEventsByDateRange
- Add createEvent with UUID generation
- Add updateEvent and deleteEvent
- Add deleteRecurringEventAndChildren
- Add category color mapping
- Use better-sqlite3 prepared statements

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 10: 이벤트 생성 UI 연결

**Files:**
- Modify: `src/renderer.js`

**Step 1: renderer.js에 이벤트 생성 로직 추가**

```javascript
// src/renderer.js에 추가
// (파일 최상단에 require 추가)
const EventsModule = require('./js/events');

// (setupEventListeners 함수 내부에 추가)
// 이벤트 저장
document.getElementById('btn-save').addEventListener('click', () => {
  saveEvent();
});

// 캘린더 날짜 셀 더블클릭 시 이벤트 생성
calendar.on('beforeCreateEvent', (eventData) => {
  const startDate = eventData.start.toDate();
  const endDate = eventData.end.toDate();

  openEventModal({
    startDate: formatDateForInput(startDate),
    startTime: formatTimeForInput(startDate),
    endDate: formatDateForInput(endDate),
    endTime: formatTimeForInput(endDate)
  });
});

// (파일 하단에 새 함수 추가)

// 이벤트 저장
function saveEvent() {
  const title = document.getElementById('event-title').value.trim();

  if (!title) {
    alert('제목을 입력해주세요');
    return;
  }

  const startDate = document.getElementById('event-start-date').value;
  const startTime = document.getElementById('event-start-time').value;
  const endDate = document.getElementById('event-end-date').value;
  const endTime = document.getElementById('event-end-time').value;

  const startDateTime = `${startDate}T${startTime}:00`;
  const endDateTime = `${endDate}T${endTime}:00`;

  // 종료 시간이 시작 시간보다 빠른지 확인
  if (new Date(endDateTime) <= new Date(startDateTime)) {
    alert('종료 시간은 시작 시간보다 늦어야 합니다');
    return;
  }

  const category = document.getElementById('event-category').value;
  const selectedColor = document.querySelector('.color-btn.active');
  const color = selectedColor ? selectedColor.dataset.color : EventsModule.getCategoryColor(category);

  const eventData = {
    title,
    description: document.getElementById('event-description').value.trim(),
    startDate: startDateTime,
    endDate: endDateTime,
    location: document.getElementById('event-location').value.trim(),
    category,
    color,
    isRecurring: document.getElementById('event-recurrence').value !== 'none',
    reminderMinutes: parseInt(document.getElementById('event-reminder').value)
  };

  // 데이터베이스에 저장
  const eventId = EventsModule.createEvent(eventData);

  // 캘린더에 이벤트 추가
  addEventToCalendar({
    id: eventId,
    ...eventData
  });

  // 모달 닫기
  closeEventModal();
}

// 캘린더에 이벤트 추가
function addEventToCalendar(event) {
  calendar.createEvents([{
    id: event.id,
    calendarId: '1',
    title: event.title,
    body: event.description || '',
    start: event.startDate,
    end: event.endDate,
    category: 'time',
    backgroundColor: event.color,
    borderColor: event.color
  }]);
}

// 모든 이벤트 로드
function loadAllEvents() {
  const events = EventsModule.getAllEvents();
  const calendarEvents = events.map(event => ({
    id: event.id,
    calendarId: '1',
    title: event.title,
    body: event.description || '',
    start: event.start_date,
    end: event.end_date,
    category: 'time',
    backgroundColor: event.color,
    borderColor: event.color
  }));

  calendar.createEvents(calendarEvents);
}

// 날짜/시간 포맷 헬퍼
function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeForInput(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// openEventModal 함수 수정
function openEventModal(defaultValues = {}) {
  document.getElementById('event-modal').classList.remove('hidden');

  // 기본값 설정
  if (defaultValues.startDate) {
    document.getElementById('event-start-date').value = defaultValues.startDate;
    document.getElementById('event-end-date').value = defaultValues.endDate || defaultValues.startDate;
  } else {
    // 현재 날짜로 초기화
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setHours(now.getHours() + 1);

    document.getElementById('event-start-date').value = formatDateForInput(now);
    document.getElementById('event-start-time').value = formatTimeForInput(now);
    document.getElementById('event-end-date').value = formatDateForInput(now);
    document.getElementById('event-end-time').value = formatTimeForInput(tomorrow);
  }

  if (defaultValues.startTime) {
    document.getElementById('event-start-time').value = defaultValues.startTime;
  }
  if (defaultValues.endTime) {
    document.getElementById('event-end-time').value = defaultValues.endTime;
  }

  // 색상 버튼 이벤트 리스너
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// initCalendar 함수 끝에 추가
function initCalendar() {
  // ... 기존 코드 ...

  // 이벤트 로드
  loadAllEvents();
}
```

**Step 2: 앱 실행 및 테스트**

Run: `npm start`

Tests:
1. "+ 새 이벤트" 버튼 클릭 → 모달 열림
2. 제목 입력, 날짜/시간 선택, 카테고리 선택
3. "저장" 클릭 → 이벤트가 캘린더에 표시됨
4. 캘린더에서 날짜 셀 더블클릭 → 해당 날짜로 모달 열림

**Step 3: 커밋**

```bash
git add src/renderer.js
git commit -m "feat: connect event creation UI to database

- Add event save handler
- Add event form validation
- Load and display events from database
- Support double-click to create event
- Auto-fill date/time inputs
- Add color picker functionality

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 11: 이벤트 수정 및 삭제 UI

**Files:**
- Modify: `src/renderer.js`
- Modify: `src/index.html`

**Step 1: index.html에 상세 모달 추가**

```html
<!-- src/index.html의 settings-modal 다음에 추가 -->

  <!-- 이벤트 상세 모달 -->
  <div id="event-detail-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="detail-title">이벤트 상세</h3>
        <button id="btn-close-detail" class="btn-icon">✕</button>
      </div>

      <div class="modal-body">
        <div class="detail-item">
          <strong>📅 시간</strong>
          <p id="detail-datetime"></p>
        </div>
        <div class="detail-item" id="detail-location-container">
          <strong>📍 장소</strong>
          <p id="detail-location"></p>
        </div>
        <div class="detail-item" id="detail-description-container">
          <strong>📝 설명</strong>
          <p id="detail-description"></p>
        </div>
        <div class="detail-item">
          <strong>🏷️ 카테고리</strong>
          <p id="detail-category"></p>
        </div>
        <div class="detail-item" id="detail-reminder-container">
          <strong>🔔 알림</strong>
          <p id="detail-reminder"></p>
        </div>
      </div>

      <div class="modal-footer">
        <button id="btn-delete-event" class="btn-secondary">삭제</button>
        <button id="btn-edit-event" class="btn-primary">수정</button>
      </div>
    </div>
  </div>
```

**Step 2: main.css에 상세 모달 스타일 추가**

```css
/* src/css/main.css에 추가 */

.detail-item {
  margin-bottom: 16px;
}

.detail-item strong {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  color: var(--text-secondary);
}

.detail-item p {
  font-size: 14px;
  color: var(--text-primary);
}
```

**Step 3: renderer.js에 수정/삭제 로직 추가**

```javascript
// src/renderer.js에 추가

// 전역 변수에 추가
let currentEditingEventId = null;

// setupEventListeners에 추가
// 이벤트 클릭 시 상세 모달 표시
calendar.on('clickEvent', ({ event }) => {
  showEventDetail(event.id);
});

// 상세 모달 관련
document.getElementById('btn-close-detail').addEventListener('click', () => {
  closeEventDetailModal();
});

document.getElementById('btn-edit-event').addEventListener('click', () => {
  editEvent(currentEditingEventId);
});

document.getElementById('btn-delete-event').addEventListener('click', () => {
  deleteEventConfirm(currentEditingEventId);
});

// 새 함수들 추가

// 이벤트 상세 표시
function showEventDetail(eventId) {
  const event = EventsModule.getEventById(eventId);
  if (!event) return;

  currentEditingEventId = eventId;

  document.getElementById('detail-title').textContent = event.title;

  // 날짜/시간 포맷팅
  const startDate = new Date(event.start_date);
  const endDate = new Date(event.end_date);
  const dateTimeStr = formatEventDateTime(startDate, endDate);
  document.getElementById('detail-datetime').textContent = dateTimeStr;

  // 장소
  if (event.location) {
    document.getElementById('detail-location').textContent = event.location;
    document.getElementById('detail-location-container').style.display = 'block';
  } else {
    document.getElementById('detail-location-container').style.display = 'none';
  }

  // 설명
  if (event.description) {
    document.getElementById('detail-description').textContent = event.description;
    document.getElementById('detail-description-container').style.display = 'block';
  } else {
    document.getElementById('detail-description-container').style.display = 'none';
  }

  // 카테고리
  document.getElementById('detail-category').textContent = event.category;

  // 알림
  if (event.reminder_minutes) {
    const reminderText = formatReminderText(event.reminder_minutes);
    document.getElementById('detail-reminder').textContent = reminderText;
    document.getElementById('detail-reminder-container').style.display = 'block';
  } else {
    document.getElementById('detail-reminder-container').style.display = 'none';
  }

  document.getElementById('event-detail-modal').classList.remove('hidden');
}

// 이벤트 상세 모달 닫기
function closeEventDetailModal() {
  document.getElementById('event-detail-modal').classList.add('hidden');
  currentEditingEventId = null;
}

// 이벤트 수정
function editEvent(eventId) {
  const event = EventsModule.getEventById(eventId);
  if (!event) return;

  // 상세 모달 닫기
  closeEventDetailModal();

  // 편집 모달 열기 및 값 채우기
  document.getElementById('modal-title').textContent = '이벤트 수정';
  document.getElementById('event-title').value = event.title;
  document.getElementById('event-description').value = event.description || '';
  document.getElementById('event-location').value = event.location || '';
  document.getElementById('event-category').value = event.category;

  const startDate = new Date(event.start_date);
  const endDate = new Date(event.end_date);

  document.getElementById('event-start-date').value = formatDateForInput(startDate);
  document.getElementById('event-start-time').value = formatTimeForInput(startDate);
  document.getElementById('event-end-date').value = formatDateForInput(endDate);
  document.getElementById('event-end-time').value = formatTimeForInput(endDate);

  document.getElementById('event-recurrence').value = event.is_recurring ? 'weekly' : 'none';
  document.getElementById('event-reminder').value = event.reminder_minutes || 15;

  // 색상 선택
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.color === event.color) {
      btn.classList.add('active');
    }
  });

  // 저장 버튼을 업데이트 모드로 변경
  const saveBtn = document.getElementById('btn-save');
  saveBtn.textContent = '수정';
  saveBtn.onclick = () => updateExistingEvent(eventId);

  document.getElementById('event-modal').classList.remove('hidden');
}

// 이벤트 업데이트
function updateExistingEvent(eventId) {
  const title = document.getElementById('event-title').value.trim();

  if (!title) {
    alert('제목을 입력해주세요');
    return;
  }

  const startDate = document.getElementById('event-start-date').value;
  const startTime = document.getElementById('event-start-time').value;
  const endDate = document.getElementById('event-end-date').value;
  const endTime = document.getElementById('event-end-time').value;

  const startDateTime = `${startDate}T${startTime}:00`;
  const endDateTime = `${endDate}T${endTime}:00`;

  if (new Date(endDateTime) <= new Date(startDateTime)) {
    alert('종료 시간은 시작 시간보다 늦어야 합니다');
    return;
  }

  const category = document.getElementById('event-category').value;
  const selectedColor = document.querySelector('.color-btn.active');
  const color = selectedColor ? selectedColor.dataset.color : EventsModule.getCategoryColor(category);

  const eventData = {
    title,
    description: document.getElementById('event-description').value.trim(),
    startDate: startDateTime,
    endDate: endDateTime,
    location: document.getElementById('event-location').value.trim(),
    category,
    color,
    isRecurring: document.getElementById('event-recurrence').value !== 'none',
    reminderMinutes: parseInt(document.getElementById('event-reminder').value)
  };

  // 데이터베이스 업데이트
  EventsModule.updateEvent(eventId, eventData);

  // 캘린더에서 이벤트 삭제 후 재추가
  calendar.deleteEvent(eventId, '1');
  addEventToCalendar({
    id: eventId,
    ...eventData
  });

  // 모달 닫기 및 초기화
  closeEventModal();
  resetEventModal();
}

// 이벤트 삭제 확인
function deleteEventConfirm(eventId) {
  if (confirm('정말 이 이벤트를 삭제하시겠습니까?')) {
    EventsModule.deleteEvent(eventId);
    calendar.deleteEvent(eventId, '1');
    closeEventDetailModal();
  }
}

// 이벤트 모달 초기화
function resetEventModal() {
  document.getElementById('modal-title').textContent = '새 이벤트';
  const saveBtn = document.getElementById('btn-save');
  saveBtn.textContent = '저장';
  saveBtn.onclick = saveEvent;
}

// 날짜/시간 포맷 헬퍼
function formatEventDateTime(startDate, endDate) {
  const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')} ${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
  const endStr = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
  return `${startStr} ~ ${endStr}`;
}

function formatReminderText(minutes) {
  if (minutes === 0) return '이벤트 시작 시';
  if (minutes === 5) return '5분 전';
  if (minutes === 15) return '15분 전';
  if (minutes === 30) return '30분 전';
  if (minutes === 60) return '1시간 전';
  if (minutes === 1440) return '1일 전';
  return `${minutes}분 전`;
}

// closeEventModal 함수 수정
function closeEventModal() {
  document.getElementById('event-modal').classList.add('hidden');
  // 폼 초기화
  document.getElementById('event-title').value = '';
  document.getElementById('event-description').value = '';
  document.getElementById('event-location').value = '';
  resetEventModal();
}
```

**Step 4: 앱 실행 및 테스트**

Run: `npm start`

Tests:
1. 캘린더에서 이벤트 클릭 → 상세 모달 표시
2. "수정" 버튼 클릭 → 편집 모달 표시, 기존 값 채워짐
3. 값 수정 후 "수정" 클릭 → 이벤트 업데이트됨
4. "삭제" 버튼 클릭 → 확인 다이얼로그 표시 후 삭제

**Step 5: 커밋**

```bash
git add src/index.html src/renderer.js src/css/main.css
git commit -m "feat: add event edit and delete functionality

- Add event detail modal
- Show event details on click
- Pre-fill edit form with existing data
- Update event in database and calendar
- Add delete confirmation dialog
- Format datetime and reminder text

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 5: 설정 및 테마

### Task 12: 설정 모듈 구현

**Files:**
- Modify: `src/js/settings.js`

**Step 1: settings.js 작성**

```javascript
// src/js/settings.js
// 설정 관리

const db = require('./database');

// 설정 가져오기
function getSetting(key) {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const result = stmt.get(key);
  return result ? result.value : null;
}

// 설정 저장
function setSetting(key, value) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?
  `);
  stmt.run(key, value, value);
  console.log('✓ 설정 저장:', key, '=', value);
}

// 모든 설정 가져오기
function getAllSettings() {
  const stmt = db.prepare('SELECT key, value FROM settings');
  const rows = stmt.all();

  const settings = {};
  rows.forEach(row => {
    settings[row.key] = row.value;
  });

  return settings;
}

// 테마 적용
function applyTheme(theme) {
  if (theme === 'auto') {
    // 시스템 설정 감지
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.body.setAttribute('data-theme', theme);
  }
}

// 시스템 테마 변경 감지
function watchSystemTheme() {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const currentTheme = getSetting('theme');
    if (currentTheme === 'auto') {
      applyTheme('auto');
    }
  });
}

// 모듈 내보내기
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getSetting,
    setSetting,
    getAllSettings,
    applyTheme,
    watchSystemTheme
  };
}
```

**Step 2: 커밋**

```bash
git add src/js/settings.js
git commit -m "feat: implement settings module

- Add getSetting and setSetting functions
- Add getAllSettings for bulk retrieval
- Add applyTheme for light/dark/auto modes
- Add watchSystemTheme for auto theme switching
- Use SQLite upsert for settings storage

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 13: 설정 UI 연결

**Files:**
- Modify: `src/renderer.js`

**Step 1: renderer.js에 설정 로직 추가**

```javascript
// src/renderer.js에 추가
// (파일 최상단에 require 추가)
const SettingsModule = require('./js/settings');

// initCalendar 함수 끝에 추가
function initCalendar() {
  // ... 기존 코드 ...

  // 이벤트 로드
  loadAllEvents();

  // 설정 로드
  loadSettings();
}

// setupEventListeners에 추가
document.getElementById('btn-save-settings').addEventListener('click', () => {
  saveSettings();
});

// 새 함수들 추가

// 설정 로드
function loadSettings() {
  const settings = SettingsModule.getAllSettings();

  // 테마 적용
  const theme = settings.theme || 'light';
  SettingsModule.applyTheme(theme);
  SettingsModule.watchSystemTheme();

  // 기본 뷰 적용
  const defaultView = settings.defaultView || 'month';
  if (defaultView !== 'month') {
    changeView(defaultView);
  }

  // 주 시작일 적용
  const weekStart = parseInt(settings.weekStart || '0');
  calendar.setOptions({
    week: {
      startDayOfWeek: weekStart
    }
  });

  console.log('✓ 설정 로드 완료');
}

// 설정 모달 열기 (수정)
function openSettingsModal() {
  const settings = SettingsModule.getAllSettings();

  // 현재 설정 값으로 폼 채우기
  document.getElementById('setting-theme').value = settings.theme || 'light';
  document.getElementById('setting-default-view').value = settings.defaultView || 'month';
  document.getElementById('setting-week-start').value = settings.weekStart || '0';

  document.getElementById('settings-modal').classList.remove('hidden');
}

// 설정 저장
function saveSettings() {
  const theme = document.getElementById('setting-theme').value;
  const defaultView = document.getElementById('setting-default-view').value;
  const weekStart = document.getElementById('setting-week-start').value;

  // 데이터베이스에 저장
  SettingsModule.setSetting('theme', theme);
  SettingsModule.setSetting('defaultView', defaultView);
  SettingsModule.setSetting('weekStart', weekStart);

  // 즉시 적용
  SettingsModule.applyTheme(theme);

  calendar.setOptions({
    week: {
      startDayOfWeek: parseInt(weekStart)
    }
  });

  // 모달 닫기
  closeSettingsModal();

  alert('설정이 저장되었습니다');
}
```

**Step 2: 앱 실행 및 테스트**

Run: `npm start`

Tests:
1. 설정 버튼 (⚙️) 클릭 → 설정 모달 열림
2. 테마를 "다크"로 변경 → 저장 → 다크 모드 적용
3. 테마를 "자동"으로 변경 → 시스템 설정에 따라 테마 변경
4. 기본 뷰를 "주간"으로 변경 → 저장 → 앱 재시작 시 주간 뷰로 시작
5. 주 시작일을 "월요일"로 변경 → 저장 → 캘린더 업데이트

**Step 3: 커밋**

```bash
git add src/renderer.js
git commit -m "feat: connect settings UI to database

- Load settings on app start
- Apply theme (light/dark/auto)
- Set default calendar view
- Set week start day
- Save settings to database
- Apply settings immediately

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 6: 검색 기능

### Task 14: 검색 모듈 구현

**Files:**
- Modify: `src/js/search.js`

**Step 1: search.js 작성**

```javascript
// src/js/search.js
// 검색 기능

const db = require('./database');

// 이벤트 검색
function searchEvents(query) {
  if (!query || query.trim() === '') {
    return [];
  }

  const searchTerm = `%${query}%`;

  const stmt = db.prepare(`
    SELECT * FROM events
    WHERE title LIKE ?
       OR description LIKE ?
       OR location LIKE ?
    ORDER BY start_date ASC
    LIMIT 50
  `);

  return stmt.all(searchTerm, searchTerm, searchTerm);
}

// 모듈 내보내기
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    searchEvents
  };
}
```

**Step 2: 커밋**

```bash
git add src/js/search.js
git commit -m "feat: implement search functionality

- Add searchEvents function
- Search in title, description, and location
- Use LIKE query with wildcards
- Limit results to 50 events
- Sort by start date

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 15: 검색 UI 연결

**Files:**
- Modify: `src/renderer.js`
- Modify: `src/css/main.css`

**Step 1: renderer.js에 검색 로직 추가**

```javascript
// src/renderer.js에 추가
// (파일 최상단에 require 추가)
const SearchModule = require('./js/search');

// 전역 변수에 추가
let searchDebounceTimer = null;

// setupEventListeners에 추가
// 검색 입력
document.getElementById('search-input').addEventListener('input', (e) => {
  handleSearchInput(e.target.value);
});

// 검색 결과 클릭
document.getElementById('search-results').addEventListener('click', (e) => {
  const resultItem = e.target.closest('.search-result-item');
  if (resultItem) {
    const eventId = resultItem.dataset.eventId;
    goToEvent(eventId);
  }
});

// 새 함수들 추가

// 검색 입력 핸들러 (디바운싱)
function handleSearchInput(query) {
  // 이전 타이머 취소
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }

  // 300ms 후 검색 실행
  searchDebounceTimer = setTimeout(() => {
    performSearch(query);
  }, 300);
}

// 검색 실행
function performSearch(query) {
  const resultsContainer = document.getElementById('search-results');

  if (!query.trim()) {
    resultsContainer.classList.remove('visible');
    resultsContainer.innerHTML = '';
    return;
  }

  const results = SearchModule.searchEvents(query);

  if (results.length === 0) {
    resultsContainer.innerHTML = '<div class="search-no-results">검색 결과가 없습니다</div>';
    resultsContainer.classList.add('visible');
    return;
  }

  const html = results.map(event => {
    const startDate = new Date(event.start_date);
    const dateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')} ${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;

    return `
      <div class="search-result-item" data-event-id="${event.id}">
        <div class="search-result-date">📅 ${dateStr}</div>
        <div class="search-result-title">${event.title}</div>
        ${event.location ? `<div class="search-result-location">📍 ${event.location}</div>` : ''}
      </div>
    `;
  }).join('');

  resultsContainer.innerHTML = html + `<div class="search-result-count">${results.length}개의 결과 찾음</div>`;
  resultsContainer.classList.add('visible');
}

// 이벤트로 이동
function goToEvent(eventId) {
  const event = EventsModule.getEventById(eventId);
  if (!event) return;

  // 검색 닫기
  toggleSearch();

  // 해당 날짜로 캘린더 이동
  const eventDate = new Date(event.start_date);
  calendar.setDate(eventDate);
  updateCalendarTitle();

  // 이벤트 하이라이트 (2초간)
  highlightEvent(eventId);

  // 상세 모달 표시
  setTimeout(() => {
    showEventDetail(eventId);
  }, 300);
}

// 이벤트 하이라이트
function highlightEvent(eventId) {
  // 캘린더에서 이벤트 요소 찾기
  const eventElements = document.querySelectorAll(`[data-event-id="${eventId}"]`);
  eventElements.forEach(el => {
    el.style.border = '2px solid #FFD700';
    el.style.boxShadow = '0 0 10px rgba(255, 215, 0, 0.5)';

    setTimeout(() => {
      el.style.border = '';
      el.style.boxShadow = '';
    }, 2000);
  });
}

// toggleSearch 함수 수정
function toggleSearch() {
  const searchBar = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');

  searchBar.classList.toggle('hidden');

  if (!searchBar.classList.contains('hidden')) {
    searchInput.focus();
  } else {
    searchInput.value = '';
    searchResults.classList.remove('visible');
    searchResults.innerHTML = '';
  }
}
```

**Step 2: main.css에 검색 결과 스타일 추가**

```css
/* src/css/main.css에 추가 */

.search-results {
  position: absolute;
  top: 100%;
  left: 20px;
  right: 20px;
  max-height: 400px;
  overflow-y: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-top: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
  display: none;
}

.search-results.visible {
  display: block;
}

.search-result-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background 0.2s;
}

.search-result-item:hover {
  background: var(--bg-hover);
}

.search-result-item:last-child {
  border-bottom: none;
}

.search-result-date {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.search-result-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.search-result-location {
  font-size: 12px;
  color: var(--text-secondary);
}

.search-result-count {
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  border-top: 1px solid var(--border-color);
}

.search-no-results {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 14px;
}
```

**Step 3: 앱 실행 및 테스트**

Run: `npm start`

Tests:
1. 검색 아이콘 (🔍) 클릭 → 검색 바 표시
2. 텍스트 입력 → 300ms 후 검색 결과 표시
3. 검색 결과 클릭 → 해당 날짜로 이동, 이벤트 하이라이트, 상세 모달 표시
4. X 버튼 클릭 → 검색 바 닫힘

**Step 4: 커밋**

```bash
git add src/renderer.js src/css/main.css
git commit -m "feat: connect search UI to database

- Add search input with debouncing (300ms)
- Display search results in dropdown
- Navigate to event on result click
- Highlight event for 2 seconds
- Show event detail modal after navigation
- Add search result styles

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 7: 알림 시스템 (기본)

### Task 16: 알림 모듈 구현

**Files:**
- Modify: `src/js/notifications.js`

**Step 1: notifications.js 작성**

```javascript
// src/js/notifications.js
// 알림/리마인더 관리

const { Notification } = require('electron');

// 스케줄된 알림 저장
const scheduledNotifications = new Map();

// 알림 스케줄링
function scheduleNotification(event) {
  if (!event.reminder_minutes && event.reminder_minutes !== 0) {
    return; // 알림 없음
  }

  const startTime = new Date(event.start_date);
  const reminderTime = new Date(startTime.getTime() - event.reminder_minutes * 60000);
  const now = new Date();

  // 과거 시간이면 스케줄하지 않음
  if (reminderTime <= now) {
    return;
  }

  const delay = reminderTime.getTime() - now.getTime();

  // 타이머 설정
  const timerId = setTimeout(() => {
    showNotification(event);
    scheduledNotifications.delete(event.id);
  }, delay);

  scheduledNotifications.set(event.id, timerId);

  console.log(`✓ 알림 스케줄: ${event.title} (${reminderTime.toLocaleString()})`);
}

// 알림 표시
function showNotification(event) {
  const startTime = new Date(event.start_date);
  const endTime = new Date(event.end_date);

  const timeStr = `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}-${String(endTime.getHours()).padStart(2, '0')}:${String(endTime.getMinutes()).padStart(2, '0')}`;

  let body = `⏰ ${formatReminderTime(event.reminder_minutes)} (${timeStr})`;
  if (event.location) {
    body += `\n📍 ${event.location}`;
  }

  const notification = new Notification({
    title: `🗓️ [${event.category}] ${event.title}`,
    body: body,
    silent: false
  });

  notification.show();

  // 클릭 시 앱 활성화 (메인 프로세스에서 처리 필요)
  notification.on('click', () => {
    console.log('알림 클릭:', event.id);
  });
}

// 알림 취소
function cancelNotification(eventId) {
  if (scheduledNotifications.has(eventId)) {
    clearTimeout(scheduledNotifications.get(eventId));
    scheduledNotifications.delete(eventId);
    console.log('✓ 알림 취소:', eventId);
  }
}

// 모든 알림 재스케줄링 (앱 시작 시)
function rescheduleAllNotifications(events) {
  // 기존 알림 모두 취소
  scheduledNotifications.forEach((timerId) => clearTimeout(timerId));
  scheduledNotifications.clear();

  // 향후 7일간의 이벤트만 스케줄링
  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  events.forEach(event => {
    const eventDate = new Date(event.start_date);
    if (eventDate >= now && eventDate <= sevenDaysLater) {
      scheduleNotification(event);
    }
  });

  console.log(`✓ ${scheduledNotifications.size}개 알림 스케줄 완료`);
}

// 알림 시간 포맷
function formatReminderTime(minutes) {
  if (minutes === 0) return '곧 시작';
  if (minutes === 5) return '5분 후 시작';
  if (minutes === 15) return '15분 후 시작';
  if (minutes === 30) return '30분 후 시작';
  if (minutes === 60) return '1시간 후 시작';
  if (minutes === 1440) return '1일 후 시작';
  return `${minutes}분 후 시작`;
}

// 모듈 내보내기
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    scheduleNotification,
    cancelNotification,
    rescheduleAllNotifications,
    showNotification
  };
}
```

**Step 2: 커밋**

```bash
git add src/js/notifications.js
git commit -m "feat: implement notification scheduling

- Add scheduleNotification for individual events
- Add rescheduleAllNotifications for app startup
- Add cancelNotification for event updates/deletes
- Use Electron Notification API
- Schedule notifications up to 7 days in advance
- Format notification body with time and location

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 17: 알림 시스템 통합

**Files:**
- Modify: `src/renderer.js`

**Step 1: renderer.js에 알림 로직 추가**

```javascript
// src/renderer.js에 추가
// (파일 최상단에 require 추가)
const NotificationsModule = require('./js/notifications');

// initCalendar 함수 끝에 추가
function initCalendar() {
  // ... 기존 코드 ...

  // 이벤트 로드
  loadAllEvents();

  // 설정 로드
  loadSettings();

  // 알림 스케줄링
  scheduleAllNotifications();
}

// saveEvent 함수 끝에 추가
function saveEvent() {
  // ... 기존 코드 ...

  // 데이터베이스에 저장
  const eventId = EventsModule.createEvent(eventData);

  // 캘린더에 이벤트 추가
  addEventToCalendar({
    id: eventId,
    ...eventData
  });

  // 알림 스케줄링
  if (eventData.reminderMinutes) {
    NotificationsModule.scheduleNotification({
      id: eventId,
      ...eventData,
      reminder_minutes: eventData.reminderMinutes,
      start_date: eventData.startDate,
      category: eventData.category
    });
  }

  // 모달 닫기
  closeEventModal();
}

// updateExistingEvent 함수에 추가
function updateExistingEvent(eventId) {
  // ... 기존 코드 ...

  // 데이터베이스 업데이트
  EventsModule.updateEvent(eventId, eventData);

  // 기존 알림 취소
  NotificationsModule.cancelNotification(eventId);

  // 새 알림 스케줄링
  if (eventData.reminderMinutes) {
    NotificationsModule.scheduleNotification({
      id: eventId,
      ...eventData,
      reminder_minutes: eventData.reminderMinutes,
      start_date: eventData.startDate,
      category: eventData.category
    });
  }

  // 캘린더에서 이벤트 삭제 후 재추가
  calendar.deleteEvent(eventId, '1');
  addEventToCalendar({
    id: eventId,
    ...eventData
  });

  // 모달 닫기 및 초기화
  closeEventModal();
  resetEventModal();
}

// deleteEventConfirm 함수에 추가
function deleteEventConfirm(eventId) {
  if (confirm('정말 이 이벤트를 삭제하시겠습니까?')) {
    // 알림 취소
    NotificationsModule.cancelNotification(eventId);

    EventsModule.deleteEvent(eventId);
    calendar.deleteEvent(eventId, '1');
    closeEventDetailModal();
  }
}

// 새 함수 추가

// 모든 알림 스케줄링
function scheduleAllNotifications() {
  const events = EventsModule.getAllEvents();
  NotificationsModule.rescheduleAllNotifications(events);
}
```

**Step 2: 앱 실행 및 테스트**

Run: `npm start`

Tests:
1. 알림 있는 이벤트 생성 (예: 현재 시간 + 1분 후, 1분 전 알림)
2. 1분 후 데스크톱 알림 표시 확인
3. 이벤트 수정 시 알림 재스케줄링 확인
4. 이벤트 삭제 시 알림 취소 확인

**Step 3: 커밋**

```bash
git add src/renderer.js
git commit -m "feat: integrate notification system

- Schedule notifications on event create
- Reschedule notifications on event update
- Cancel notifications on event delete
- Load all notifications on app start
- Support all reminder time options

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 8: 마무리 및 개선

### Task 18: README 작성

**Files:**
- Create: `README.md`

**Step 1: README.md 작성**

```markdown
# macOS 캘린더 앱

macOS용 독립형 데스크톱 캘린더 애플리케이션입니다.

## 주요 기능

- ✅ 월간/주간/일간 캘린더 뷰
- ✅ 이벤트 생성/수정/삭제
- ✅ 반복 이벤트 지원 (예정)
- ✅ 데스크톱 알림/리마인더
- ✅ 간단한 검색 기능
- ✅ 라이트/다크 모드

## 기술 스택

- **Electron 28+**: 데스크톱 앱 프레임워크
- **Toast UI Calendar 2.x**: 캘린더 UI 라이브러리
- **better-sqlite3**: 로컬 데이터베이스
- **순수 HTML/CSS/JavaScript**: 복잡한 프레임워크 없음

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 앱 실행
npm start

# 개발 모드 (DevTools 포함)
npm run dev
```

## 프로젝트 구조

```
calendar-app/
├── main.js                   # Electron 메인 프로세스
├── src/
│   ├── index.html           # 메인 화면
│   ├── renderer.js          # UI 로직
│   ├── css/                 # 스타일시트
│   └── js/                  # 비즈니스 로직
├── data/                    # SQLite 데이터베이스
└── docs/                    # 문서
```

## 단축키

- `Cmd + N`: 새 이벤트 생성
- `Cmd + F`: 검색

## 개발자

Kay (youngjun.hwang@myrealtrip.com)

## 라이선스

MIT
```

**Step 2: 커밋**

```bash
git add README.md
git commit -m "docs: add README

- Add project overview
- List main features
- Add installation instructions
- Document project structure
- Add keyboard shortcuts

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 19: 앱 아이콘 추가 (선택사항)

**Note:** 실제 아이콘 파일이 있다면 추가. 없으면 이 단계는 스킵 가능.

**Files:**
- Add: `src/assets/icons/icon.png`
- Modify: `main.js`

**Step 1: 아이콘 파일 준비**

macOS용 512x512 PNG 아이콘 파일을 `src/assets/icons/icon.png`에 저장

**Step 2: main.js 수정**

```javascript
// main.js의 createWindow 함수 수정
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'src/assets/icons/icon.png'), // 추가
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    titleBarStyle: 'hiddenInset',
    show: false
  });

  // ... 나머지 코드 동일
}

// createTray 함수 수정
function createTray() {
  const iconPath = path.join(__dirname, 'src/assets/icons/icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  // ... 나머지 코드 동일
}
```

**Step 3: 커밋**

```bash
git add src/assets/icons/icon.png main.js
git commit -m "feat: add app icon

- Add 512x512 PNG icon
- Set window icon
- Set tray icon with 16x16 resize

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 20: 최종 테스트 및 검증

**Step 1: 전체 기능 테스트**

Tests:
1. ✅ 앱 시작 및 캘린더 표시
2. ✅ 이벤트 생성/수정/삭제
3. ✅ 월간/주간/일간 뷰 전환
4. ✅ 검색 기능
5. ✅ 설정 저장 및 테마 전환
6. ✅ 알림 표시
7. ✅ 데이터 지속성 (앱 재시작 후 데이터 유지)

**Step 2: 버그 수정 (발견 시)**

발견된 버그는 즉시 수정하고 커밋

**Step 3: 최종 커밋**

```bash
git add .
git commit -m "chore: final testing and verification

All core features tested and working:
- Event CRUD operations
- Calendar view switching
- Search functionality
- Settings persistence
- Notification system
- Theme switching

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 다음 단계 (Phase 9: 반복 이벤트 - 선택사항)

반복 이벤트 기능은 복잡하므로 별도 계획으로 진행 권장:

1. `recurrence.js` 모듈 구현
2. 반복 규칙 파싱 로직
3. 가상 인스턴스 생성
4. 예외 처리
5. UI에 반복 이벤트 옵션 추가

---

## 구현 완료 확인사항

- [x] Phase 1: 프로젝트 초기화 및 기본 구조
- [x] Phase 2: 데이터베이스 설정
- [x] Phase 3: Toast UI Calendar 통합
- [x] Phase 4: 이벤트 관리 (CRUD)
- [x] Phase 5: 설정 및 테마
- [x] Phase 6: 검색 기능
- [x] Phase 7: 알림 시스템
- [x] Phase 8: 마무리 및 개선

**총 예상 시간:** 각 Task당 5-15분, 전체 약 3-5시간

---

## 주의사항

- 각 Task는 독립적으로 실행 및 테스트 가능
- 모든 변경사항은 즉시 커밋
- DRY 원칙 준수 (중복 코드 최소화)
- YAGNI 원칙 준수 (당장 필요하지 않은 기능 제외)
- 비개발자도 이해할 수 있도록 한글 주석 충분히 작성
