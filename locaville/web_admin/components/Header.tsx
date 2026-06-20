"use client"

/**
 * 상단 헤더 바. 마을명 + 사용자 이름 + 오늘 날짜 + 알림/로그아웃 아이콘.
 * 로그아웃 버튼은 web_admin 로컬 세션을 비우고 로그인 화면으로 이동합니다.
 */
import { useRouter } from "next/navigation"
import { Bell, LogOut } from "lucide-react"
import { clearAdminSession } from "@/lib/admin-auth-storage"

/** 상단 헤더 컴포넌트. `todayLabel` 이 있으면 우측에 날짜 노출. */
export function Header({
  todayLabel,
  userName,
}: {
  todayLabel?: string
  userName?: string
}) {
  const router = useRouter()

  function handleLogout() {
    clearAdminSession()
    router.replace("/")
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-user">{userName}</span>
        {todayLabel && (
          <>
            <span className="topbar-divider" aria-hidden>·</span>
            <span className="topbar-date">{todayLabel}</span>
          </>
        )}
      </div>
      <div className="topbar-right">
        <button type="button" className="topbar-icon-btn" aria-label="알림">
          <Bell size={20} />
        </button>
        <button
          type="button"
          className="topbar-icon-btn topbar-logout"
          aria-label="로그아웃"
          onClick={handleLogout}
        >
          <LogOut size={18} />
          <span>로그아웃</span>
        </button>
      </div>
    </header>
  )
}
