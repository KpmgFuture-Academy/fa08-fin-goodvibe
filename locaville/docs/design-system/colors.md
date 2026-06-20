# 색상 시스템

`v0_chief` 는 **베이지 배경 + 농협 녹색 강조** 의 따뜻한 농촌 톤. 모든 색은 [`app/globals.css`](../../locaville/v0_chief/app/globals.css) 의 `:root` 에 CSS 변수로 정의돼 있고, 컴포넌트는 `var(--name)` 으로만 사용.

## 사용 원칙

- **하드코딩 hex 금지** — 항상 `var(--name)` 사용
- **신규 색 추가 시** → `:root` 에 토큰 신설 + 본 문서 갱신
- **2가지 톤(다크/라이트) 미지원** — `color-scheme: light` 고정

---

## 1. 표면 / 배경 (Surface)

마을 정보 카드, 시트, 화면 배경에 사용. 베이지 계열로 따뜻한 인상.

| 토큰 | Hex | 미리보기 | 용도 |
|---|---|---|---|
| `--bg` | `#f3efe4` | ![bg](https://img.shields.io/badge/-%23f3efe4-f3efe4) | 본문 배경 (body) |
| `--bg-soft` | `#fffaf0` | ![bgsoft](https://img.shields.io/badge/-%23fffaf0-fffaf0) | 카드 헤더, input 배경, 강조 박스 |
| `--card` | `#ffffff` | ![card](https://img.shields.io/badge/-%23ffffff-ffffff) | 카드 본문 (대비) |

---

## 2. 텍스트 (Ink)

본문 텍스트는 진한 녹회색 (#1f2a1f). 회색 4단계로 정보 우선순위 표현.

| 토큰 | Hex | 미리보기 | 용도 |
|---|---|---|---|
| `--ink` | `#1f2a1f` | ![ink](https://img.shields.io/badge/-%231f2a1f-1f2a1f) | 본문 기본 텍스트 |
| `--ink-soft` | `#3d4a3d` | ![inksoft](https://img.shields.io/badge/-%233d4a3d-3d4a3d) | 본문 보조 (input 안 텍스트 등) |
| `--muted` | `#5e6356` | ![muted](https://img.shields.io/badge/-%235e6356-5e6356) | 라벨, 설명, 부제 |
| `--muted-2` | `#8a8e7e` | ![muted2](https://img.shields.io/badge/-%238a8e7e-8a8e7e) | 가장 약함 — 빈 상태 아이콘, 미세 정보 |

`.muted` 유틸 클래스 = `color: var(--muted)` — globals.css 에 사전 정의.

---

## 3. 구분선 (Line)

카드 경계, 테이블 row 구분 등.

| 토큰 | Hex | 미리보기 | 용도 |
|---|---|---|---|
| `--line` | `#d2c9b1` | ![line](https://img.shields.io/badge/-%23d2c9b1-d2c9b1) | 강한 구분선 (카드 테두리, 테이블 헤더 하단) |
| `--line-soft` | `#e6dfca` | ![linesoft](https://img.shields.io/badge/-%23e6dfca-e6dfca) | 약한 구분선 (테이블 row 사이, 카드 내부 섹션 분리) |

---

## 4. 브랜드 / 액션 (Accent)

농협 녹색 계열. 주요 액션 버튼(`primary`), 활성 메뉴, 강조 텍스트.

| 토큰 | Hex | 미리보기 | 용도 |
|---|---|---|---|
| `--accent` | `#2f6d4f` | ![accent](https://img.shields.io/badge/-%232f6d4f-2f6d4f) | primary 버튼 배경, 강조 텍스트, 사이드바 활성 |
| `--accent-dark` | `#1c4a36` | ![accentdark](https://img.shields.io/badge/-%231c4a36-1c4a36) | primary 버튼 hover, 사이드바 상단 |
| `--accent-soft` | `#e3f0e6` | ![accentsoft](https://img.shields.io/badge/-%23e3f0e6-e3f0e6) | success 배경 (badge `ok`, 활성 영역) |

---

## 5. 경고 / 위험 (Status)

진행 중·검토 필요는 주황(`warn`), 재촬영·삭제는 빨강(`danger`).

| 토큰 | Hex | 미리보기 | 용도 |
|---|---|---|---|
| `--warn` | `#b5601b` | ![warn](https://img.shields.io/badge/-%23b5601b-b5601b) | 주황 텍스트/아이콘 (검토 필요, 진행 중) |
| `--warn-soft` | `#fff0d8` | ![warnsoft](https://img.shields.io/badge/-%23fff0d8-fff0d8) | 주황 배경 (badge `warn`) |
| `--danger` | `#a12b2b` | ![danger](https://img.shields.io/badge/-%23a12b2b-a12b2b) | 빨강 텍스트/아이콘 (재촬영, 삭제 액션) |
| `--danger-soft` | `#ffe2e2` | ![dangersoft](https://img.shields.io/badge/-%23ffe2e2-ffe2e2) | 빨강 배경 (badge `danger`) |
| `--info-soft` | `#edf5f7` | ![infosoft](https://img.shields.io/badge/-%23edf5f7-edf5f7) | 정보 배경 (안내 박스) |

---

## 6. 사이드바 (Sidebar)

본문과 대비되는 다크 녹색 — 시각적 hierarchy. 본문에선 사용 금지.

| 토큰 | Hex | 미리보기 | 용도 |
|---|---|---|---|
| `--sidebar-bg` | `#1c4a36` | ![sbg](https://img.shields.io/badge/-%231c4a36-1c4a36) | 사이드바 배경 (상단) |
| `--sidebar-bg-2` | `#15392a` | ![sbg2](https://img.shields.io/badge/-%2315392a-15392a) | 사이드바 배경 (하단, 그라데이션) |
| `--sidebar-ink` | `#f3efe4` | ![sink](https://img.shields.io/badge/-%23f3efe4-f3efe4) | 사이드바 텍스트 (밝음) |
| `--sidebar-ink-soft` | `#cbd9cf` | ![sinksoft](https://img.shields.io/badge/-%23cbd9cf-cbd9cf) | 사이드바 보조 텍스트 |
| `--sidebar-line` | `#2a5a44` | ![sline](https://img.shields.io/badge/-%232a5a44-2a5a44) | 사이드바 구분선 |
| `--sidebar-active` | `#2f6d4f` | ![sactive](https://img.shields.io/badge/-%232f6d4f-2f6d4f) | 활성 메뉴 배경 (= `--accent`) |

---

## 7. 시멘틱 매핑

상태 코드별 자동 색 적용 — [Badge 컴포넌트](components.md#badge) 가 처리.

| 상태 코드 | tone | 색 |
|---|---|---|
| `confirmed`, `completed` | `ok` | 녹색 (`--accent-soft` 배경 + `--accent` 글자) |
| `in_progress`, `needs_review`, `manual_review_required` | `warn` | 주황 (`--warn-soft` 배경 + `--warn` 글자) |
| `retake_required` | `danger` | 빨강 (`--danger-soft` 배경 + `--danger` 글자) |
| `saved`, `created` | `muted` | 회색 (`--line-soft` 배경 + `--muted` 글자) |
| `pending`, 그 외 | `neutral` | 베이지 (`--bg-soft` 배경 + `--ink-soft` 글자) |

---

## 사용 예시

```css
/* 카드 */
.my-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
}

/* 보조 텍스트 */
.my-label {
  color: var(--muted);
  font-size: 13px;
}

/* primary 액션 */
.my-action {
  background: var(--accent);
  color: white;
}
.my-action:hover {
  background: var(--accent-dark);
}
```

```tsx
// React 컴포넌트 안 인라인 스타일
<div style={{ borderTop: "1px solid var(--line-soft)", color: "var(--muted)" }}>
  보조 정보
</div>
```
