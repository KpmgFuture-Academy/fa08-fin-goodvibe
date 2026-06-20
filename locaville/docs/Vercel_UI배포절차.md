# Vercel UI 배포 절차

이 문서는 `locaville` 리포지토리의 세 가지 프런트엔드 앱(농업인 앱, 이장님 대시보드, 관리자 콘솔)을 Vercel에 배포하는 표준 절차를 정리합니다.

## 요약
- 프로젝트 구조: `locaville/app_user`, `locaville/web_user`, `locaville/web_admin` (각각 별도 Vercel Project 권장)
- 패키지 매니저: `pnpm` (각 앱에 `package.json` 및 lockfile 필요)
- 중요한 환경변수: `NEXT_PUBLIC_API_BASE_URL` (backend API base URL)

---

## 사전 준비

1. 로컬에서 각 프런트엔드가 정상 빌드되는지 확인합니다.

```bash
# 예: 이장님 대시보드
cd locaville/web_user
pnpm install --frozen-lockfile
pnpm build
pnpm start # (로컬 확인용)
```

2. 레포지토리에 `package.json`과 `pnpm-lock.yaml`(또는 `shrinkwrap`)이 있는지 확인하세요.
3. 배포용으로 사용할 Git 브랜치(예: `main`)를 정리합니다.

---

## Vercel에 프로젝트 추가 (권장: 앱별로 3개 생성)

각 앱을 별도의 Vercel Project로 생성하면 환경변수/빌드 설정을 독립적으로 관리하기 쉽습니다.

1. Vercel에 로그인 → `New Project` → Git 리포지토리 연결
2. `Configure Project`에서 다음을 설정합니다:
   - Root Directory: 예) `locaville/web_user` (프로젝트별로 맞게 설정)
   - Framework Preset: `Next.js` (자동 감지되지 않으면 수동 선택)
   - Install Command: `pnpm install --frozen-lockfile`  
   - Build Command: `pnpm build`  
   - Output Directory: leave default (Next.js는 자동으로 처리됨)

3. `Environment Variables` 에 필수 값을 추가합니다 (Preview/Production 구분해서 입력):
   - `NEXT_PUBLIC_API_BASE_URL` = `https://api.example.com` (배포 환경의 백엔드 주소)
   - (옵션) `NEXT_PUBLIC_SOME_KEY`, `SENTRY_DSN` 등 앱에서 사용하는 공개 env

4. 배포 Branch: Production으로 사용할 브랜치(예: `main`) 선택

---

## Monorepo 팁

- Vercel에서 monorepo를 다룰 때는 `Root Directory`를 각 앱 폴더로 지정해야 합니다.
- 동일한 레포지토리에서 PR마다 Preview가 생성되므로 각 앱의 Root가 올바른지 확인하세요.

---

## CORS 및 백엔드 연동

- `NEXT_PUBLIC_API_BASE_URL`이 올바르게 설정되어 있지 않으면 런타임에서 API 호출이 실패합니다.
- 백엔드(예: Render/Render/자체 호스팅)에서 CORS 허용 도메인에 Vercel의 배포 도메인(예: `my-app.vercel.app`)을 추가하세요. 백엔드 설정 파일은 `locaville/backend/app/main.py`의 `allow_origins` 참조.

---

## 배포 확인

1. Vercel에서 배포가 완료되면 Preview 또는 Production URL에 접속합니다.
2. 콘솔에서 빌드 로그를 확인하여 `pnpm install` 및 `pnpm build` 단계가 성공했는지 검토합니다.
3. 브라우저에서 네트워크 탭을 열어 API 호출이 `NEXT_PUBLIC_API_BASE_URL`로 향하는지 확인하세요.

---

## 문제 해결(FAQ)

- 빌드 실패: `pnpm install`에서 오류가 나면 `package.json`과 `pnpm-lock.yaml`의 일관성을 확인하세요. 로컬에서 `pnpm install --frozen-lockfile`이 통과해야 합니다.
- 404가 뜸: Root Directory가 잘못되었을 가능성 큽니다. Vercel 프로젝트 설정에서 Root를 확인하세요.
- env가 적용되지 않음: Preview/Production 각각에 env를 별도로 입력해야 합니다. Vercel은 기본적으로 Preview와 Production 환경을 분리합니다.
- getUserMedia(카메라) 작동 안 함: 브라우저에서 HTTPS 필요합니다(로컬은 localhost 가능). Vercel 배포 URL은 HTTPS가 기본이므로 동작해야 합니다.

---

## 롤백 및 강제 재배포

- Vercel 대시보드의 `Deployments` 탭에서 이전 배포로 `Rollback` 가능합니다.
- 수동 재배포가 필요하면 커밋을 트리거하거나 `Redeploy` 버튼을 사용하세요.

---

## 체크리스트

- [ ] 각 앱별로 Vercel Project 생성 및 Root Directory 지정
- [ ] `NEXT_PUBLIC_API_BASE_URL` (Preview/Prod) 설정
- [ ] `pnpm build` 로컬 검증 완료
- [ ] 백엔드 CORS에 Vercel 도메인 추가

---

추가로 자동화(예: 배포 후 헬스 체크 스크립트, Slack 알림, Sentry 릴리스 태깅)가 필요하면 알려주세요. 간단한 GitHub Actions나 Vercel Webhook 예시도 만들어 드리겠습니다.

---

## CI/CD: GitHub Actions + Vercel CLI (예시)

Vercel의 Git 통합 대신 GitHub Actions를 사용해 배포 파이프라인을 구성하면, 빌드/테스트를 조정하거나 monorepo 특화 흐름을 적용하기 쉽습니다. 아래 예시는 `locaville/web_user`를 `main` 브랜치에 푸시할 때 Vercel CLI로 프로덕션 배포하는 간단한 워크플로우입니다.

1. GitHub 리포지토리의 `Settings > Secrets and variables > Actions`에 다음 시크릿을 추가합니다:
   - `VERCEL_TOKEN` — Vercel personal token (프로젝트/조직 배포 권한 필요)
   - 선택적: `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — 여러 프로젝트가 있을 때 명시적으로 지정하면 안전합니다.

2. `.github/workflows/deploy.yml` 예시:

아래 예시는 monorepo 내 세 개의 앱(`locaville/web_user`, `locaville/app_user`, `locaville/web_admin`)을 대상으로 하는 범용 워크플로입니다. `push`(main)일 때는 Production에 배포하고, PR이나 수동 실행일 때는 Preview(Production 제외)로 배포합니다.

```yaml
name: Deploy Locaville frontends to Vercel

on:
  push:
    branches: [ main ]
  pull_request:
    types: [opened, synchronize, reopened]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        app:
          - name: web_user
            path: locaville/web_user
          - name: app_user
            path: locaville/app_user
          - name: web_admin
            path: locaville/web_admin
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install deps
        run: |
          cd ${{ matrix.app.path }}
          pnpm install --frozen-lockfile

      - name: Build
        run: |
          cd ${{ matrix.app.path }}
          pnpm build

      - name: Install Vercel CLI
        run: npm install -g vercel

      - name: Deploy to Vercel
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          # Optional: set per-app project id secrets like VERCEL_PROJECT_ID_web_user
          VERCEL_PROJECT_ID: ${{ secrets['VERCEL_PROJECT_ID_' + matrix.app.name] }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
        run: |
          if [[ "${{ github.event_name }}" == "push" && "${{ github.ref }}" == "refs/heads/main" ]]; then
            vercel --token $VERCEL_TOKEN --prod --confirm --cwd=${{ matrix.app.path }}
          else
            vercel --token $VERCEL_TOKEN --confirm --cwd=${{ matrix.app.path }}
          fi
```

Notes:
- Set `VERCEL_TOKEN` in GitHub Secrets. Optionally add per-app secrets like `VERCEL_PROJECT_ID_web_user` if you want to force a specific Vercel project per app.
- The workflow deploys each app in parallel (matrix). If you prefer sequential deploys, remove the matrix and loop or add job dependency.

---

### 수동 CLI 배포 (로컬 또는 CI)

로컬에서 Vercel CLI를 사용해 빠르게 배포하려면:

```bash
# 로그인(한 번만 필요)
npx vercel login

# monorepo의 웹앱 폴더에서 배포
cd locaville/web_user
npx vercel --prod --confirm
```

환경변수와 시크릿 관리는 Vercel Dashboard의 Project > Settings > Environment Variables에서 관리하세요. GitHub Actions에서 배포할 때는 `VERCEL_TOKEN`을 GitHub 시크릿에 추가하면 CLI가 자동으로 인증합니다.

---

문서에 추가할 다른 CI 규칙(예: PR마다 Preview 배포, E2E 테스트 트리거, Sentry 릴리스 태그 적용)이 있으면 알려주시면 예시 워크플로를 더 작성해 드리겠습니다.

