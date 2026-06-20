# 디자인 시스템 — v0_chief 기준

마을 관리자(이장) 대시보드 `v0_chief` 의 디자인 토큰·컴포넌트 정의. 신규 화면 추가/팀원 합류 시 이 문서를 기준으로 일관성 유지.

## 구성

- [colors.md](colors.md) — 색상 토큰 (CSS 변수 + Hex)
- [typography.md](typography.md) — 폰트 패밀리·크기·굵기 스케일
- [spacing.md](spacing.md) — 패딩·마진·gap 토큰
- [components.md](components.md) — 8개 UI 프리미티브 스펙

## 적용 환경

- **Frontend**: Next.js 16 + React 19 + TypeScript
- **스타일**: `app/globals.css` 의 CSS 커스텀 프로퍼티(`--var`) 와 클래스 (`.btn`, `.card` 등) 기반
- **컴포넌트 경로**: [`v0_chief/components/ui/`](../../locaville/v0_chief/components/ui/) — 8개 .tsx
- **글로벌 스타일**: [`v0_chief/app/globals.css`](../../locaville/v0_chief/app/globals.css)

## 디자인 컨셉

- **베이지(`#f3efe4`) + 농협 녹색(`#2f6d4f`)** — 농촌·따뜻함·친환경
- **기본 18px** — 고령 이장님 가독성 우선. 일반 web 대비 1단계 크게
- **둥근 모서리 12px** — 부드러운 인상
- **사이드바 다크 녹색** — 본문 베이지와 명확한 대비

## 신규 컴포넌트 추가 시 체크리스트

1. 색상은 CSS 변수 (`var(--accent)`) 만 사용 — 하드코딩 hex 금지
2. 글자 크기는 [typography.md](typography.md) 의 스케일 안에서 선택
3. 간격은 [spacing.md](spacing.md) 의 토큰 (`8/12/16/20/24/...`) 으로
4. 새 토큰이 필요하면 `globals.css` 의 `:root` 에 추가 후 문서 갱신
5. `.tsx` 컴포넌트는 className 으로 globals.css 클래스 적용 — `style={}` 인라인 최소화

## 자주 묻는 질문

**Q: v0_farmer (농민 앱) 도 같은 토큰 쓰나요?**
A: 핵심 컬러 팔레트는 공유 중이지만, 폰트·간격은 모바일 first 라 일부 다름. 본 문서는 v0_chief 기준이며 v0_farmer 통합은 별도 작업.

**Q: 다크모드는?**
A: 현재 미지원 (`color-scheme: light`). 도입 시 `[data-theme="dark"]` 가드 + 토큰 별도 매핑 필요.

**Q: Tailwind 안 써요?**
A: `globals.css` 의 클래스 기반. utility 가 필요한 경우는 인라인 `style` 으로 처리하되, 최소화.
