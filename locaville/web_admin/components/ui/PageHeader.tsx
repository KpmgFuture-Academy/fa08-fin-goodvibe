"use client"

/**
 * 페이지 상단 헤더 — 제목 + 부제 + 액션 슬롯 + (선택) 뒤로가기 버튼.
 * `backHref` 가 있으면 좌측에 화살표 버튼을 노출하고 라우터로 이동.
 */
import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

export function PageHeader({
  title,
  sub,
  actions,
  backHref,
}: {
  title: string
  sub?: string
  actions?: ReactNode
  backHref?: string
}) {
  const router = useRouter()
  return (
    <div className="page-header">
      <div className="page-header-left">
        {backHref && (
          <button
            type="button"
            className="page-back"
            onClick={() => router.push(backHref)}
            aria-label="뒤로가기"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div>
          <h1 className="page-title">{title}</h1>
          {sub && <p className="page-sub">{sub}</p>}
        </div>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  )
}
