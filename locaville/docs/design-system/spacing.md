# 간격 시스템

여백·패딩·gap 모두 **4의 배수** 기준. 시각적 리듬 유지 + 임의값 방지.

## 스케일

| 토큰 (px) | 용도 | 자주 쓰는 위치 |
|---:|---|---|
| **4** | 미세 (icon ↔ text 사이) | 아이콘 옆 작은 라벨 |
| **6** | 알약 내부 (badge padding 일부) | Badge text 좌우 |
| **8** | 좁음 (행 간 gap, button-icon) | `.btn-icon` margin, gap |
| **10** | 약간 좁음 (작은 카드 내부 row gap) | 그리드 내 item gap |
| **12** | 기본 row gap, 일반 padding | 메뉴 항목 padding, gap-12 |
| **14** | 본문 padding (좁은 카드) | 내부 박스 padding |
| **16** | 컨텐츠 padding, 그리드 gap | 카드 본문 padding 1축 |
| **18** | 카드 본문 padding (넓은 쪽) | 사업 카드 안 padding |
| **20** | 카드 본문 padding (충분히 넓음) | 카드 body |
| **22** | 사이드바 좌우 padding | sidebar-brand |
| **24** | 섹션 사이 마진, 그리드 gap | 카드들 사이 마진 |
| **28** | 페이지 상단 padding | shell-content top padding |
| **32** | 페이지 좌우 padding | shell-content 좌우 |
| **40** | 큰 분리 | EmptyState 내부 padding |
| **48** | 페이지 하단 padding | shell-content bottom |

> **원칙**: 가장 빈번하게 쓰는 값은 **8, 12, 16, 20, 24**. 그 외는 특수 케이스.

---

## 페이지 레이아웃

```
shell-content (페이지 본문 컨테이너)
├ padding: 28px 32px 48px;         /* 상 / 좌우 / 하 */
└ max-width: 1400px;
└ margin: 0 auto;

@media (max-width: 1024px)
  padding: 20px 16px 40px;          /* 모바일 약간 좁게 */
```

---

## 컴포넌트 별 패딩 가이드

| 컴포넌트 | padding | gap |
|---|---|---|
| **Card body** | `20px` (균등) | — |
| **Card head** | `18px 20px` | 12px (좌측 텍스트 stack) |
| **Modal head** | `16px 22px 20px` | 12px |
| **Sidebar brand** | `22px 22px 18px` | — |
| **Sidebar menu link** | `12px 14px` | 12px (icon ↔ text) |
| **Btn-sm** | `8px 14px` | — |
| **Btn-md** | `11px 18px` | — |
| **Btn-lg** | `14px 24px` | — |
| **Badge** | `6px 12px` (알약) | — |
| **Input** | `8px 12px` | — |
| **Page header** | `0 32px` (좌우만) | 10px |

---

## Gap (Flex / Grid)

가로/세로 항목 사이 간격. CSS `gap` 사용.

| 용도 | 값 |
|---:|---|
| 인라인 (icon + text) | `8px` |
| 작은 그룹 (badge 들) | `8~10px` |
| 카드 내부 sub-section | `12~16px` |
| 카드들 사이 (그리드) | `16~18px` |
| 큰 섹션들 사이 (페이지 내) | `24px` |

```tsx
{/* 카드 그리드 — Step A 패턴 */}
<div style={{
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: 18,
}}>

{/* 한 카드 안 row stack */}
<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
```

---

## 둥근 모서리 (radius)

| 토큰 | 값 | 용도 |
|---:|---|---|
| `--radius` | `12px` | 카드, 큰 박스, primary 버튼 |
| `--radius-sm` | `8px` | input, 작은 박스, badge 안 |
| `--radius-pill` | `999px` | 알약 형태 (Badge) |

---

## 미디어 쿼리

`globals.css` 에 정의된 단일 브레이크포인트:

```css
@media (max-width: 1024px) {
  /* 사이드바 가로 → 세로 */
  /* 페이지 padding 축소 */
}
```

추가 브레이크가 필요하면 본 문서 갱신 후 표준화.

---

## 안티 패턴

- ❌ **임의값**: `padding: 23px` — 가까운 스케일 (`22`, `24`) 로
- ❌ **margin-bottom 으로 stack 만들기**: `<div style={{marginBottom: 12}}>` — `flex + gap` 사용
- ❌ **center 정렬에 margin auto**: `flexbox`/`grid` 의 `justify`/`align` 사용

## 신규 값 추가

스케일에 없는 값이 진짜 필요한 경우:
1. 인접 토큰 (예: 16 vs 24) 로 해결 가능한지 먼저 검토
2. 정말 새 값이 필요하면 본 문서 표에 추가 + 용도 명시
