/**
 * 카드 UI 프리미티브 — globals.css 의 `.card` / `.card-head` / `.card-body` 클래스 래퍼.
 * 대시보드 모든 섹션 박스의 기본 컨테이너.
 */
import type { ReactNode } from "react"

/** 둥근 박스. `section` 시맨틱으로 렌더. */
export function Card({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <section className={`card${className ? ` ${className}` : ""}`} style={style}>
      {children}
    </section>
  )
}

/** 카드 상단 헤더. 제목 + 보조 텍스트 + (선택) 우측 액션 슬롯. */
export function CardHead({
  title,
  sub,
  note,
  action,
}: {
  title: string
  sub?: string
  note?: string
  action?: ReactNode
}) {
  return (
    <header className="card-head">
      <div className="card-head-left">
        <span className="card-head-title">{title}</span>
        {sub && <span className="card-head-sub">{sub}</span>}
        {note && <span className="card-head-note">{note}</span>}
      </div>
      {action && <div className="card-head-action">{action}</div>}
    </header>
  )
}

/** 카드 본문 영역. 패딩 자동. */
export function CardBody({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={`card-body${className ? ` ${className}` : ""}`} style={style}>
      {children}
    </div>
  )
}
