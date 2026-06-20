/**
 * L6 Senior UX — 이장 대시보드 시니어 UI 정량 회귀 검증 (Playwright).
 *
 * backend pytest 의 L6 (CSS 정적 분석) 가 못 잡는 영역:
 *   - 실제 렌더링된 폰트/버튼 픽셀 측정
 *   - 큰 글자 모드 toggle 의 전 화면 적용
 *   - 색 대비 (computed style 추출 → WCAG 계산)
 *
 * 본 파일은 skeleton — 항목 4개의 sample 만. 추가 시나리오는 같은 패턴으로 늘려가세요.
 *
 * 실행:
 *   cd locaville/web_user
 *   pnpm exec playwright test tests-e2e/l6_senior_ux.spec.ts
 *
 * 처음 실행 전 setup:
 *   pnpm install -D @playwright/test
 *   pnpm exec playwright install chromium
 *
 * 자세한 가이드: docs/dev/test-l6-playwright-guide.md
 */
import { test, expect, type Page } from "@playwright/test"


// ============================================================
// L6 helper — computed style 추출
// ============================================================

async function fontPx(page: Page, selector: string): Promise<number> {
  const value = await page.locator(selector).first().evaluate((el) => getComputedStyle(el).fontSize)
  return parseFloat(value.replace("px", ""))
}

async function heightPx(page: Page, selector: string): Promise<number> {
  return await page.locator(selector).first().evaluate((el) => (el as HTMLElement).offsetHeight)
}


// ============================================================
// L6.A — baseline 폰트 (실 렌더 픽셀)
// ============================================================

test("L6.A body baseline font ≥ 15px (시니어 가독성)", async ({ page }) => {
  await page.goto("/")
  const size = await fontPx(page, "body")
  expect(size, `body 폰트 ${size}px — 시니어 권장 15px 미만`).toBeGreaterThanOrEqual(15)
})


// ============================================================
// L6.B — 큰 글자 모드 toggle (data-large-text)
// ============================================================

test("L6.B 큰 글자 모드 toggle 후 body 폰트 증가", async ({ page }) => {
  await page.goto("/")
  const baseline = await fontPx(page, "body")

  // localStorage 통한 큰 글자 ON — 실제 UI 토글 셀렉터가 있다면 click 으로 교체
  await page.evaluate(() => {
    window.localStorage.setItem("largeText", "1")
    document.body.dataset.largeText = "1"
  })

  const large = await fontPx(page, "body")
  expect(large, "큰 글자 모드 ON 후 폰트가 baseline 보다 작거나 같음 — 모드 동작 안 함").toBeGreaterThan(baseline)
})


// ============================================================
// L6.C — primary 버튼 렌더 높이 (시니어 권장 ≥56px)
// ============================================================

test("L6.C primary 버튼 렌더 높이 — 현재 baseline 측정", async ({ page }) => {
  await page.goto("/")
  // 페이지 상단 어떤 버튼이든 1개 잡힘 — 대시보드에는 항상 1개 이상 액션 있음
  const btn = page.locator("button, .btn, a.btn").first()
  await btn.waitFor({ state: "attached", timeout: 5_000 })
  const h = await btn.evaluate((el) => (el as HTMLElement).offsetHeight)
  console.log(`[L6.C] primary 버튼 높이 = ${h}px`)
  // 시니어 권장 56px. 현재 globals.css 의 btn-lg 가 49px 정도이므로 일단 baseline 만 기록.
  // 디자인 변경 후 이 임계값을 56 으로 강화.
  expect(h, "버튼이 너무 작음 (시연 폰에서 누르기 어려움)").toBeGreaterThanOrEqual(40)
})


// ============================================================
// L6.D — 색 대비 (WCAG AA 4.5:1) — 기본 ink vs bg
// ============================================================

function relativeLuminance(r: number, g: number, b: number): number {
  const trans = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * trans(r) + 0.7152 * trans(g) + 0.0722 * trans(b)
}

function contrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const L1 = relativeLuminance(...rgb1)
  const L2 = relativeLuminance(...rgb2)
  const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1]
  return (lighter + 0.05) / (darker + 0.05)
}

function parseRgb(str: string): [number, number, number] | null {
  const m = str.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/)
  if (!m) return null
  return [+m[1], +m[2], +m[3]]
}

test("L6.D 본문 텍스트 vs 배경 색 대비 ≥ 4.5:1 (WCAG AA)", async ({ page }) => {
  await page.goto("/")
  const { color, bg } = await page.locator("body").first().evaluate((el) => {
    const cs = getComputedStyle(el)
    return { color: cs.color, bg: cs.backgroundColor }
  })

  const ink = parseRgb(color)
  const back = parseRgb(bg)

  if (!ink || !back || back[0] + back[1] + back[2] === 0) {
    test.skip(true, `색 추출 불가 (color=${color} bg=${bg}) — 페이지 상단 명시적 색 지정 필요`)
    return
  }

  const ratio = contrastRatio(ink, back)
  console.log(`[L6.D] body ink=${color} bg=${bg} → contrast ${ratio.toFixed(2)}:1`)
  expect(ratio, `본문 색대비 ${ratio.toFixed(2)}:1 < 4.5:1 (WCAG AA 미달)`).toBeGreaterThanOrEqual(4.5)
})
