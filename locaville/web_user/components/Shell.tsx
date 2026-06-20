"use client"

/**
 * v0_chief 의 메인 레이아웃 셸. RootLayout 에서 모든 페이지를 이 셸 안쪽에 렌더.
 * 좌측 사이드바 + 상단 헤더 + 본문(children) 의 3-영역 구조.
 *
 * SettingsProvider 안에서 viewMode/textSize 를 공유.
 * lvb-main 의 className/zoom 이 원본 chief 와 동일한 효과로 모든 자손에 cascade.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { CurrentUserVillageProvider } from "@/components/CurrentUserVillageContext"
import { SettingsProvider, useChiefSettings } from "@/components/SettingsContext"
import { Sidebar } from "@/components/Sidebar"
import { Header, type WeeklyForecastRow } from "@/components/Header"
import { HelpFloatingButton } from "@/components/help/HelpFloatingButton"
import { getAdminAgriWeather } from "@/lib/admin-api"
import { prefetchChiefAll } from "@/lib/chief-resources"
import { getCurrentUserVillageInfo } from "@/lib/user-village-context-api"
import type { CurrentUserVillageInfo } from "@/lib/user-village-context-types"

/** "2026년 5월 21일" 형태의 오늘 날짜. 헤더 우측에 노출. */
function todayLabel() {
  try {
    const d = new Date()
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
  } catch {
    return ""
  }
}

function ShellInner({
  villageName,
  villageAddress,
  weeklyForecast,
  children,
}: {
  villageName: string
  villageAddress: string
  weeklyForecast: WeeklyForecastRow[]
  children: ReactNode
}) {
  const settings = useChiefSettings()

  return (
    <div className="lvb-shell">
      <a href="#lvb-main-content" className="lvb-skiplink">
        본문으로 바로가기
      </a>
      <Sidebar villageName={villageName} villageAddress={villageAddress} />
      <div
        className={`lvb-main${settings.mainClass ? " " + settings.mainClass : ""}`}
        style={{
          // Chromium 은 zoom 으로 모든 요소 비례, Firefox 폴백으로 fontSize 도 같이 변경.
          // 베이스 18px 에 zoom 배율 — rem 기반 컴포넌트가 비례하게.
          zoom: settings.zoom,
          fontSize: 18 * settings.zoom,
        }}
      >
        <Header todayLabel={todayLabel()} weeklyForecast={weeklyForecast} />
        <main id="lvb-main-content" className="lvb-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const mountedRef = useRef(true)
  const [currentUserVillageInfo, setCurrentUserVillageInfo] = useState<CurrentUserVillageInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [weeklyForecast, setWeeklyForecast] = useState<WeeklyForecastRow[]>([])

  const loadCurrentUserContext = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true)
      setError("")
    }
    try {
      const data = await getCurrentUserVillageInfo()
      if (!mountedRef.current) return
      setCurrentUserVillageInfo(data)
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : "현재 사용자 정보를 불러오지 못했습니다.")
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void loadCurrentUserContext()
    getAdminAgriWeather()
      .then((w) => {
        if (!mountedRef.current) return
        const list = (w.weeklyForecast || []) as WeeklyForecastRow[]
        setWeeklyForecast(list)
        if (list.length === 0) {
          console.warn(
            "[Shell] weeklyForecast 비어있음 — backend fallback 모드일 수 있어요",
            w,
          )
        }
      })
      .catch((err) => {
        console.warn("[Shell] /admin/agri-weather 호출 실패", err)
      })

    return () => {
      mountedRef.current = false
    }
  }, [loadCurrentUserContext])

  // 접속 시 이장님 4탭 공용 데이터를 미리 받아둔다(프리페치 → 탭 전환 즉시).
  // 처음엔 ville 무관 항목, villeId 가 준비되면 ville 종속 항목까지.
  const prefetchVilleId = currentUserVillageInfo?.village?.ville_id ?? ""
  useEffect(() => {
    prefetchChiefAll(prefetchVilleId || null)
  }, [prefetchVilleId])

  const villageName =
    (currentUserVillageInfo?.village?.ville_name || "").trim() ||
    (loading ? "" : "(마을 미설정)")
  const villageAddress = (currentUserVillageInfo?.village?.addr_1 || "").trim()

  return (
    <CurrentUserVillageProvider
      value={{
        currentUserVillageInfo,
        loading,
        error,
        refresh: loadCurrentUserContext,
      }}
    >
      <SettingsProvider>
        <ShellInner
          villageName={villageName}
          villageAddress={villageAddress}
          weeklyForecast={weeklyForecast}
        >
          {children}
        </ShellInner>
      </SettingsProvider>
      <HelpFloatingButton />
    </CurrentUserVillageProvider>
  )
}
