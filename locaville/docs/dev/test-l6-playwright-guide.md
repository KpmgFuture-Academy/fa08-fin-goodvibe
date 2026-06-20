# L6 Playwright 가이드 — 시니어 UX 실 렌더 검증

> backend pytest 의 L6 (CSS 정적 분석) 가 못 잡는 영역을 Playwright 로 자동화.
> 본 가이드는 web_user (이장 대시보드) 만 다룸. app_user / web_admin 은 같은 패턴으로 확장.

## 왜 frontend e2e 가 필요한가

backend L6 (`tests/test_l6_senior_ux.py`) 는 globals.css 의 룰 정의를 정규식으로 검사. 못 잡는 것:

| 못 잡는 영역 | 왜 |
|---|---|
| **실 렌더링 폰트 픽셀** | CSS 의 `font-size: 17px` 이 inline override / `em` 누적 후 실제 몇 px 인지 |
| **버튼 렌더 높이** | font + padding + border-box 합산 후의 실측. CSS 만 봐선 답 안 나옴 |
| **큰 글자 모드 적용 범위** | toggle 후 전 화면 셀렉터들이 다 커지는지 |
| **색 대비** | CSS 변수 `--ink` / `--bg` → 실제 HEX 합성 후 WCAG 4.5:1 계산 |
| **모바일/데스크톱 viewport 차이** | 동일 페이지의 폰 vs PC 렌더 차이 |
| **접근성 alt / label** | aria-label, alt, role 누락 검사 |

## Setup (1회)

```powershell
cd C:\Users\Admin\good-vibe\locaville\web_user
pnpm install -D @playwright/test
pnpm exec playwright install chromium   # ~150MB, 1회만
```

`package.json` 의 `devDependencies` 에 `@playwright/test` 자동 추가됨.

선택: `scripts` 에도 단축 명령 추가:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test:e2e": "playwright test"
}
```

## 실행

```powershell
cd C:\Users\Admin\good-vibe\locaville\web_user

# 전체 (자동으로 next dev 띄움 — config 의 webServer 가 처리)
pnpm exec playwright test

# 단일 파일
pnpm exec playwright test tests-e2e/l6_senior_ux.spec.ts

# 헤드리스 끄고 (브라우저 보기)
pnpm exec playwright test --headed

# UI 모드 (시각적 디버깅 + 시간여행)
pnpm exec playwright test --ui

# 특정 프로젝트만 (config 의 projects)
pnpm exec playwright test --project=iphone-14
```

## 현재 작성된 sample 4개

[`web_user/tests-e2e/l6_senior_ux.spec.ts`](../../web_user/tests-e2e/l6_senior_ux.spec.ts):

| ID | 항목 | 임계값 |
|---|---|---|
| L6.A | body 실 렌더 폰트 | ≥ 15px |
| L6.B | `data-large-text="1"` toggle 후 폰트 증가 | baseline 보다 큼 |
| L6.C | primary 버튼 렌더 높이 | 현재 ≥ 40px (시니어 권장 56px 까지 강화 예정) |
| L6.D | 본문 색 대비 (WCAG AA) | ≥ 4.5:1 |

## 추가 작성 권장 시나리오 (다음 라운드)

### 농민 앱 (app_user) 별도 config

`app_user/playwright.config.ts` 동일 패턴, port 3000. 시니어 UX 가 가장 중요한 곳이라 다음 우선:

- 홈 진입 후 "오늘 한마디" 카드 3-4줄 렌더 + 폰트 ≥ 17px
- 오늘 할 일 카드 누름 → 사진 첨부 흐름 진입 (각 버튼 ≥ 56px)
- 큰 글자 모드 ON 후 사진 첨부 / 음성 / 일지 / 설정 5개 화면 폰트 ≥ 18px

### web_admin 별도 config

- 사업 등록 페이지 (`/project/new`) → 파일 업로드 zone 키보드 조작 가능
- 사업 detail 의 활동/Job 등록 모달 — tab 순서 + 포커스 표시

### 시연 시나리오 자동화

[`docs/demo/final-demo-scenario.md`](../demo/final-demo-scenario.md) 의 시연 흐름을 그대로 Playwright 스크립트로 — 매 시연 직전 1회 돌리면 핵심 흐름 정상 확인.

## CI 통합 권장 (선택)

```yaml
# .github/workflows/e2e.yml (예시)
- run: pnpm install
- run: pnpm exec playwright install --with-deps chromium
- run: pnpm exec playwright test
- if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: playwright-report/
```

`use.trace: "on-first-retry"` + `screenshot: "only-on-failure"` 가 config 에 이미 있어 실패 시 자동 trace + screenshot 저장.

## 트러블슈팅

| 증상 | 원인 | fix |
|---|---|---|
| `Error: browserType.launch: Executable doesn't exist` | chromium 미설치 | `pnpm exec playwright install chromium` |
| `dev server 안 뜸` | port 3001 점유 / `pnpm dev` 실패 | 수동 `pnpm dev -p 3001` 후 config 의 `reuseExistingServer: true` 확인 |
| `색 추출 불가 (bg=rgba(0,0,0,0))` | body 가 명시 배경색 없음 (다음 요소가 색 지정) | 페이지 `<html>` 또는 `<body>` 에 `background` 명시 |
| 큰 글자 모드 적용 안 됨 | `localStorage` 가 페이지 reload 전엔 적용 안 됨 | `await page.goto()` 후 `localStorage.setItem` + 다시 reload |

## 본 가이드 외 참고

- Playwright 공식 docs: https://playwright.dev
- WCAG 색대비 계산: https://webaim.org/articles/contrast/
- backend L6 (CSS 정적): [`backend/tests/test_l6_senior_ux.py`](../../backend/tests/test_l6_senior_ux.py)
- 4-Level 전체 정의: [`docs/dev/test-scenarios.md`](./test-scenarios.md)
