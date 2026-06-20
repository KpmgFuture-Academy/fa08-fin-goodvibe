"use client"

/**
 * 이장님 화면 좌측 사이드바 — 원본 chief 디자인(lvb-side*).
 *
 * 구성: 브랜드(로고+이름) / 마을 카드 / 4 메뉴(처리함·마을·사업·일정) / 설정·사용자 푸터.
 * 영농일지·증빙·도우미·단체관리·사업참여는 메뉴에 두지 않고 URL 직접 접근만 유지.
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Briefcase,
  Calendar,
  Home,
  Inbox,
  Type,
  Users,
} from "lucide-react"
import { fetchVillageProjects } from "@/lib/projects"
import {
  getLaggardFarmers,
  getRecentEvidence,
  getVillageDetail,
  listFarmHelpers,
} from "@/lib/admin-api"
import { buildInbox, INBOX_EVIDENCE_LIMIT, INBOX_LAGGARD_LIMIT } from "@/lib/chief-adapters"
import { useCurrentUserVillage } from "@/components/CurrentUserVillageContext"
import { useChiefSettings } from "@/components/SettingsContext"

const NAV = [
  { href: "/dashboard", label: "처리함", icon: Inbox, key: "inbox" as const },
  { href: "/residents", label: "마을", icon: Users, key: "village" as const },
  { href: "/projects", label: "사업", icon: Briefcase, key: "projects" as const },
  { href: "/calendar", label: "일정", icon: Calendar, key: "calendar" as const },
] as const

export function Sidebar({
  villageName = "",
  villageAddress: _villageAddress = "",
}: {
  villageName?: string
  villageAddress?: string
}) {
  const pathname = usePathname()
  const village = useCurrentUserVillage()
  const villeId = village.currentUserVillageInfo?.village?.ville_id ?? ""
  const userName = village.currentUserVillageInfo?.user?.user_name ?? ""

  const [groupCount, setGroupCount] = useState(0)
  const [projectCount, setProjectCount] = useState(0)
  const [inboxCount, setInboxCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!villeId) return
    const [vd, ps, ev, lg, hp] = await Promise.all([
      getVillageDetail(villeId).catch(() => null),
      fetchVillageProjects({ ville_id: villeId }).catch(() => []),
      // 대시보드 처리함과 동일한 상한 — 배지 숫자가 본문 "오늘 처리할 일 N건" 과 일치하게.
      getRecentEvidence(INBOX_EVIDENCE_LIMIT).catch(() => []),
      getLaggardFarmers(7, INBOX_LAGGARD_LIMIT).catch(() => []),
      listFarmHelpers(villeId).catch(() => []),
    ])
    setGroupCount(vd?.groups?.length ?? 0)
    setProjectCount(ps.length)
    const items = buildInbox({
      evidence: ev,
      laggards: lg,
      helpers: hp,
      resolveImg: (p) => p,
    })
    setInboxCount(items.length)
  }, [villeId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 사이드바 푸터의 글자 크기 토글 — Context 의 textSize 를 표시.
  // 누르면 보통 → 크게 → 아주 크게 → 보통 순환. 보기 모드(쉬운/표준) 는 상단 설정 모달에서.
  const settings = useChiefSettings()
  const settingLabel = settings.textSize  // "보통" / "크게" / "아주 크게"
  const toggleLargeText = useCallback(() => {
    if (settings.textSize === "보통") settings.setTextSize("크게")
    else if (settings.textSize === "크게") settings.setTextSize("아주 크게")
    else settings.setTextSize("보통")
  }, [settings])

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")

  return (
    <aside className="lvb-side" aria-label="주요 메뉴">
      <div className="lvb-side-brand">
        {/* 저탄마을 로고 — 시연 화면에서 잘 보이게 크게. PNG 라 배경 살짝 톤 다운. */}
        <img
          src="/logo.png"
          alt="저탄마을"
          style={{
            width: 64,
            height: 64,
            borderRadius: 14,
            background: "#fffaf0",
            objectFit: "contain",
            padding: 4,
            flexShrink: 0,
          }}
        />
        <div className="lvb-side-brand-txt">
          <b>저탄마을</b>
          <span>이장님 화면</span>
        </div>
      </div>

      <div className="lvb-side-village">
        <div className="lvb-side-village-label">우리 마을</div>
        <div className="lvb-side-village-name">{villageName || "—"}</div>
        <div className="lvb-side-village-sub">
          {groupCount}개 단체 · 사업 {projectCount}개
        </div>
      </div>

      <nav className="lvb-side-nav">
        {NAV.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          const badge = item.key === "inbox" ? inboxCount : 0
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`lvb-side-link${active ? " is-on" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={22} />
              <span>{item.label}</span>
              {badge > 0 && (
                <span className="lvb-side-badge" aria-label={`처리할 일 ${badge}건`}>
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="lvb-side-foot">
        <button
          type="button"
          className="lvb-side-settings"
          onClick={toggleLargeText}
          title="누르면 글자 크기가 한 단계 커져요"
          aria-label={`글자 크기 — 현재 ${settingLabel}, 누르면 다음 크기`}
        >
          <Type size={20} />
          <span>글자 크기</span>
          <span className="lvb-side-settings-mode">{settingLabel}</span>
        </button>
        <div className="lvb-side-chief">
          <span className="lvb-side-chief-badge">
            <Home size={18} />
          </span>
          <div>
            <b>{userName || "—"}</b>
            <span>{villageName ? `${villageName} 이장` : ""}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

// 페이지 라벨 매핑 — Header 가 import.
export function pageLabelFromPath(pathname: string): string {
  for (const item of NAV) {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) return item.label
  }
  return ""
}
