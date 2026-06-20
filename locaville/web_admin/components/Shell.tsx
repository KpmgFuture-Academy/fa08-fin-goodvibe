"use client"

/**
 * web_admin 의 메인 레이아웃 셸. RootLayout 에서 모든 페이지를 이 셸 안쪽에 렌더.
 * 좌측 사이드바 + 상단 헤더 + 본문(children) 의 3-영역 구조.
 * web_admin 은 admin 로그인 세션만 사용하며, village/user_master 컨텍스트는 조회하지 않습니다.
 */
import { useEffect, useRef, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Sidebar } from "@/components/Sidebar"
import { Header } from "@/components/Header"
import { readAdminSession, type AdminSession } from "@/lib/admin-auth-storage"

/** "2026년 5월 21일" 형태의 오늘 날짜. 헤더 우측에 노출. */
function todayLabel() {
  try {
    const d = new Date()
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
  } catch {
    return ""
  }
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const mountedRef = useRef(true)
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    mountedRef.current = true

    if (pathname === "/") {
      setAuthChecked(true)
      return () => {
        mountedRef.current = false
      }
    }

    const session = readAdminSession()
    if (!session) {
      setAuthChecked(true)
      router.replace("/")
      return () => {
        mountedRef.current = false
      }
    }

    setAdminSession(session)
    setAuthChecked(true)

    return () => {
      mountedRef.current = false
    }
  }, [pathname, router])

  if (pathname === "/") {
    return <>{children}</>
  }

  if (!authChecked || !adminSession) {
    return <div className="loading">인증 상태를 확인하는 중...</div>
  }

  const userName = adminSession.name || adminSession.login_id || "(관리자 미설정)"

  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-main">
        <Header todayLabel={todayLabel()} userName={userName} />
        <main className="shell-content">{children}</main>
      </div>
    </div>
  )
}
