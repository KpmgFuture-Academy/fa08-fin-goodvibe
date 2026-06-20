# UI 컴포넌트 스펙

`v0_chief/components/ui/` 의 8개 프리미티브. **모든 화면은 이 컴포넌트 조합으로**.

## 목록

| 컴포넌트 | 파일 | 용도 |
|---|---|---|
| [Btn](#btn) | `Btn.tsx` | 액션 버튼 (5 variant × 3 size) |
| [Card / CardHead / CardBody](#card) | `Card.tsx` | 박스 컨테이너 |
| [Badge](#badge) | `Badge.tsx` | 상태 알약 (8 status 자동 매핑) |
| [Bar](#bar) | `Bar.tsx` | 진행률 막대 |
| [StatCard](#statcard) | `StatCard.tsx` | KPI 카드 (라벨 + 큰 값) |
| [PageHeader](#pageheader) | `PageHeader.tsx` | 페이지 상단 (제목 + 부제 + 액션 + 뒤로) |
| [EmptyState](#emptystate) | `EmptyState.tsx` | 데이터 없음 표시 |
| [Modal](#modal) | `Modal.tsx` | 다이얼로그 (ESC, 스크롤 락) |

---

## Btn

표준 액션 버튼. 5 종의 variant 와 3 종의 size 조합.

### Props

```tsx
<Btn
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger"   // default: "outline"
  size?: "sm" | "md" | "lg"                                             // default: "md"
  icon?: ReactNode                                                       // 왼쪽 아이콘 슬롯
  fullWidth?: boolean                                                    // default: false (block)
  disabled?: boolean
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  type?: "button" | "submit" | "reset"                                  // default: "button"
  title?: string                                                         // tooltip
  className?: string                                                     // 추가 클래스
>
  텍스트
</Btn>
```

### Variant 의미

| Variant | 색 / 인상 | 언제 |
|---|---|---|
| **primary** | `--accent` (녹색) 배경, 흰 글자 | 가장 강조 — "저장", "신청", "상세 보기" |
| **secondary** | `--accent-soft` 배경, `--accent` 글자 | 보조 강조 — "취소 후 저장" 같이 두 번째 옵션 |
| **outline** | 흰 배경 + `--line` 보더 | 기본 (default) — 평범한 액션 |
| **ghost** | 투명 배경, hover 시 약한 배경 | 정보성 — "더 보기", 메뉴 안 |
| **danger** | `--danger-soft` 배경, `--danger` 글자 | 파괴적 — "삭제", "재촬영", "거절" |

### Size 의미

| Size | padding / font | 언제 |
|---|---|---|
| **sm** | `8px 14px` / 14px | 표 안 액션, 알람 행 |
| **md** | `11px 18px` / 16px | 기본 — 페이지 내 일반 액션 |
| **lg** | `14px 24px` / 19px | 강조 (예: 사진 촬영 큰 버튼) |

### 예시

```tsx
import { Btn } from "@/components/ui/Btn"
import { RefreshCw, Eye, Bell, Trash2 } from "lucide-react"

// 기본
<Btn>취소</Btn>

// 페이지 우상단 새로고침
<Btn icon={<RefreshCw size={16} />} onClick={load}>새로고침</Btn>

// 카드 안 fullWidth primary
<Btn variant="primary" icon={<Eye size={16} />} fullWidth>
  상세 보기
</Btn>

// 행 안 작은 액션
<Btn size="sm" icon={<Bell size={13} />} onClick={() => alarm(name)}>
  알람
</Btn>

// 위험
<Btn variant="danger" icon={<Trash2 size={16} />}>
  삭제
</Btn>
```

---

## Card

박스 컨테이너. 헤더·본문 분리 구조.

### Props

```tsx
<Card className?: string>
  <CardHead title="..." sub?="..." note?="..." action?={...} />     // optional
  <CardBody className?: string>
    내용
  </CardBody>
</Card>
```

- `<Card>` = `<section>` 으로 렌더 (시맨틱)
- `CardHead` 는 제목 + 부제 + (선택) 우측 액션
- `CardBody` 는 padding 20px 자동

### 예시

```tsx
import { Card, CardHead, CardBody } from "@/components/ui/Card"

// 1) 가장 단순 — 헤더 없이 본문만
<Card>
  <CardBody>아무 내용</CardBody>
</Card>

// 2) 헤더 + 본문
<Card>
  <CardHead title="농가별 이행 현황" sub="참여 농가 6명 · 활동 2종" />
  <CardBody>
    <table>...</table>
  </CardBody>
</Card>

// 3) 헤더 우측에 액션 슬롯
<Card>
  <CardHead
    title="최근 일지"
    action={<Btn size="sm">전체 보기</Btn>}
  />
  <CardBody>...</CardBody>
</Card>
```

---

## Badge

상태 알약. backend 상태 코드 → 한국어 라벨 + 색 자동 매핑.

### Props

```tsx
<Badge
  status?: string         // 자동 매핑 (TONE_BY_STATUS)
  label?: string          // 명시 라벨 (status 매핑 덮어쓰기)
  tone?: BadgeTone        // 명시 톤 ("ok" | "warn" | "danger" | "neutral" | "muted")
/>
```

세 가지 사용 패턴:
1. **status 만** — 매핑 자동 (status="completed" → "완료" + ok 톤)
2. **label + tone 명시** — 임의 라벨 + 색
3. **status + label** — 매핑된 톤 유지, 라벨만 덮어쓰기

### 자동 매핑

| status | tone | 라벨 |
|---|---|---|
| `confirmed` | ok | 확인 완료 |
| `completed` | ok | 완료 |
| `saved` | muted | 저장됨 |
| `created` | muted | 생성됨 |
| `in_progress` | warn | 진행 중 |
| `needs_review` | warn | 검토 필요 |
| `manual_review_required` | warn | 수동 확인 |
| `retake_required` | danger | 재촬영 필요 |
| `pending` | neutral | 대기 |

### 예시

```tsx
import { Badge } from "@/components/ui/Badge"

// 매핑 자동
<Badge status="completed" />            // "완료" + 녹색

// 매핑 + 라벨 덮어쓰기
<Badge status="completed" label="완료 (3/3)" />

// 임의 라벨 + 톤
<Badge label="진행중" tone="warn" />

// 매핑 없는 코드 → label/tone 명시 권장
<Badge label={`${count}건`} tone={count > 0 ? "warn" : "neutral"} />
```

---

## Bar

진행률 막대. 0~100 범위 자동 클램프 + ARIA progressbar.

### Props

```tsx
<Bar
  value: number                      // 0 ~ 100 (범위 밖은 자동 clamp)
  height?: "sm" | "md" | "lg"        // default: "md"
/>
```

| Height | 크기 | 용도 |
|---|---|---|
| **sm** | 작음 | 표 cell 안 인라인 진행률 |
| **md** | 기본 | 카드 안 일반 진행률 |
| **lg** | 큼 | KPI 영역, 페이지 상단 강조 |

### 예시

```tsx
import { Bar } from "@/components/ui/Bar"

// 큰 진행률 + 숫자 옆에
<div style={{ display: "flex", alignItems: "center", gap: 18 }}>
  <span style={{ fontSize: 44, fontWeight: 800 }}>{pct}%</span>
  <div style={{ flex: 1 }}>
    <Bar value={pct} height="lg" />
  </div>
</div>

// 표 안 인라인
<div className="cell-progress">
  <Bar value={row.pct} height="sm" />
  <span>{row.pct}%</span>
</div>
```

---

## StatCard

대시보드 상단 KPI 카드. 라벨 + 큰 숫자 + 보조 텍스트.

### Props

```tsx
<StatCard
  label: string                  // 라벨 (위)
  value: ReactNode               // 큰 값 (36px / 800)
  sub?: string                   // 보조 텍스트 (아래, 작게)
  warn?: boolean                 // true 면 강조 색
  icon?: ReactNode               // 라벨 옆 아이콘
/>
```

`warn=true` 시 `stat-card-warn` 클래스 적용 — 누락/주의 강조.

### 예시

```tsx
import { StatCard } from "@/components/ui/StatCard"
import { Users, AlertCircle } from "lucide-react"

// 일반 KPI
<StatCard label="참여 농가" value="8명" icon={<Users size={18} />} />

// 진척률 + 보조 텍스트
<StatCard label="완료" value="12건" sub="33%" />

// 누락 강조
<StatCard label="누락 증빙" value="4건" warn={true} icon={<AlertCircle size={18} />} />

// 그리드 배치
<div className="stat-grid">
  <StatCard label="참여 농가" value={`${farmers}명`} />
  <StatCard label="전체 To-do" value={`${total}건`} />
  <StatCard label="완료" value={`${done}건`} sub={`${pct}%`} />
  <StatCard label="누락" value={`${missing}건`} warn={missing > 0} />
</div>
```

> `.stat-grid` 는 globals.css 의 그리드 유틸 (자동 4~2 컬럼).

---

## PageHeader

페이지 상단 — 제목 + 부제 + 액션 + (선택) 뒤로가기.

### Props

```tsx
<PageHeader
  title: string                    // h1, 28px/800
  sub?: string                     // 부제 (작게)
  actions?: ReactNode              // 우측 액션 슬롯 (Btn 등)
  backHref?: string                // 있으면 좌측에 ← 버튼, router.push
/>
```

### 예시

```tsx
import { PageHeader } from "@/components/ui/PageHeader"
import { RefreshCw } from "lucide-react"

// 목록 페이지 — 뒤로가기 없음
<PageHeader
  title="참여사업관리"
  sub="마을이 참여 중인 사업 3개. 카드를 눌러 상세를 확인하세요."
  actions={
    <Btn icon={<RefreshCw size={16} />} onClick={load}>새로고침</Btn>
  }
/>

// 상세 페이지 — 뒤로가기
<PageHeader
  title={project.prj_name}
  sub={project.period}
  backHref="/projects"
/>
```

---

## EmptyState

데이터 없을 때 — 아이콘 + 제목 + 설명.

### Props

```tsx
<EmptyState
  icon?: ReactNode
  title: string
  description?: string
/>
```

### 예시

```tsx
import { EmptyState } from "@/components/ui/EmptyState"
import { Search } from "lucide-react"

<Card>
  <EmptyState
    icon={<Search size={36} />}
    title="검색 결과가 없습니다"
    description="다른 조건으로 다시 시도해 주세요."
  />
</Card>
```

> **항상 `<Card>` 안에 둠** — 단독으로 페이지에 띄우지 않음.

---

## Modal

다이얼로그. ESC 닫기 + body 스크롤 락 + backdrop 클릭 닫기 + ARIA.

### Props

```tsx
<Modal
  open: boolean                    // 표시 여부 (false 면 unmount)
  title: string                    // 헤더 제목
  onClose: () => void              // 닫기 콜백 (ESC, X, backdrop)
  children: ReactNode              // 본문
  footer?: ReactNode               // (선택) 하단 액션 영역
  width?: string                   // default: "560px" — maxWidth
/>
```

### 예시

```tsx
import { Modal } from "@/components/ui/Modal"
import { useState } from "react"

const [open, setOpen] = useState(false)

<>
  <Btn onClick={() => setOpen(true)}>증빙 검토</Btn>

  <Modal
    open={open}
    title="증빙 사진 검토"
    onClose={() => setOpen(false)}
    width="640px"
    footer={
      <>
        <Btn onClick={() => setOpen(false)}>취소</Btn>
        <Btn variant="primary" onClick={confirm}>승인</Btn>
      </>
    }
  >
    <img src={evidence.image_url} style={{ width: "100%" }} />
    <p>{evidence.user_message}</p>
  </Modal>
</>
```

### 동작 디테일

- ESC 키 → onClose
- backdrop 클릭 → onClose
- 모달 body 클릭 → 닫히지 않음 (stopPropagation)
- 모달 열리는 동안 `body { overflow: hidden }` — 배경 스크롤 잠금
- **여러 모달 동시 열림 시 lock count 관리** — 마지막 모달 닫혀야 unlock
- `role="dialog"` + `aria-modal="true"` — 스크린리더 호환

---

## 안티 패턴 (모든 컴포넌트 공통)

- ❌ **컴포넌트 직접 수정**: 새 prop 추가 — 본 문서 갱신 + 팀 합의 후
- ❌ **className 으로 globals.css 클래스 우회**: `<button className="btn">` 같은 raw 사용 — Btn 컴포넌트 사용
- ❌ **inline style 남발**: `style={{...}}` 5줄 넘으면 globals.css 의 클래스로 추출 검토
- ❌ **임의 색**: `style={{ color: "red" }}` — 시멘틱 토큰 (`var(--danger)`)
- ❌ **아이콘 라이브러리 혼용**: `lucide-react` 만 사용 — 다른 라이브러리 (heroicons 등) 추가 금지

## 신규 컴포넌트 추가 절차

1. `components/ui/` 에 `.tsx` 추가
2. globals.css 에 클래스 추가 (`.my-comp`, `.my-comp-*`)
3. 본 문서에 섹션 추가 — Props / Variant / 예시 / 안티 패턴
4. 다른 컴포넌트와 일관성 확인 (color, padding, font)
5. PR 시 디자인 시스템 영향 명시
