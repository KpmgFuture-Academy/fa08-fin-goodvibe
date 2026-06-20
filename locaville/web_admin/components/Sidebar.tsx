"use client"

/**
 * 좌측 사이드바 — 마을 브랜드 + 프로젝트 관리 메뉴 + 역할 표시.
 * 현재 경로(`usePathname`) 기준으로 active 상태를 자동 표시합니다.
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { CloudSun, DatabaseZap, FolderKanban, MapPinned, Settings2 } from "lucide-react"

const NAV = [
  { href: "/project", label: "프로젝트 관리", icon: FolderKanban },
  { href: "/rag", label: "RAG 관리", icon: DatabaseZap },
  { href: "/village", label: "마을관리", icon: MapPinned },
  { href: "/weather", label: "날씨정보 관리", icon: CloudSun },
] as const

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-title">저탄마을</div>
      </div>
      <nav className="sidebar-nav">
        {NAV.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${active ? " sidebar-link-active" : ""}`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="sidebar-footer">
        <Link
          href="/profile"
          className={`sidebar-role sidebar-footer-link${
            pathname === "/profile" ? " sidebar-link-active" : ""
          }`}
        >
          <Settings2 size={18} />
          <span>정보수정</span>
        </Link>
      </div>
    </aside>
  )
}
