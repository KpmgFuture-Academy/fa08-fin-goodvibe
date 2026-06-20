/**
 * Playwright config — web_user (이장 대시보드) 시니어 UX 자동 검증용.
 *
 * 사용:
 *   pnpm install -D @playwright/test
 *   pnpm exec playwright install chromium    # ~150MB
 *   pnpm exec playwright test                # 자동으로 dev server 띄움
 *
 * baseURL 의 backend (NEXT_PUBLIC_API_BASE_URL) 가 실행 중이어야 일부 테스트가 통과.
 * UI invariant (폰트/버튼 크기/색 대비) 만 검증하는 테스트는 backend 없이도 동작.
 */
import { defineConfig, devices } from "@playwright/test"

const PORT = 3001
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./tests-e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // 시니어가 자주 쓰는 큰 화면 / 폰 비교
      name: "iphone-14",
      use: { ...devices["iPhone 14"] },
    },
  ],
  webServer: {
    command: `pnpm dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
