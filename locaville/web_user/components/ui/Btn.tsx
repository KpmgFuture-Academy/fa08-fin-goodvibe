/**
 * 표준 버튼. globals.css 의 `.btn-{variant}` / `.btn-{size}` 클래스 적용.
 *
 * 우선순위: primary (강조), secondary (보조), outline (기본), ghost (투명), danger (재촬영/삭제).
 */
import type { ReactNode, MouseEvent } from "react"

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger"
type Size = "sm" | "md" | "lg"

/** 디자인 시스템의 표준 버튼. `icon` 슬롯이 있으면 텍스트 왼쪽에 노출. */
export function Btn({
  children,
  disabled = false,
  variant = "outline",
  size = "md",
  onClick,
  icon,
  className,
  type = "button",
  title,
  fullWidth = false,
}: {
  children: ReactNode
  disabled?: boolean
  variant?: Variant
  size?: Size
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  icon?: ReactNode
  className?: string
  type?: "button" | "submit" | "reset"
  title?: string
  fullWidth?: boolean
}) {
  const classes = [
    "btn",
    `btn-${variant}`,
    `btn-${size}`,
    fullWidth ? "btn-full" : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ")
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className={classes}>
      {icon && <span className="btn-icon">{icon}</span>}
      <span>{children}</span>
    </button>
  )
}
