"use client"

/**
 * 이장님 화면 설정(보기 모드 + 글자 크기) 전역 상태.
 *
 * 원본 chief 프로토타입과 같은 효과를 내려면:
 *   - lvb-main 의 className 에 `.lvb-easy` 토글
 *   - lvb-main 의 inline style 에 zoom 배율 (TEXT_ZOOM × easyMultiplier)
 *
 * SettingsPanel(헤더 설정 모달) 과 Sidebar 푸터 라벨이 같은 값을 봐야 하므로 Context 로 묶음.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export type ViewMode = "easy" | "standard"
export type TextSize = "보통" | "크게" | "아주 크게"

export const TEXT_ZOOM: Record<TextSize, number> = {
  "보통": 1,
  "크게": 1.1,
  "아주 크게": 1.22,
}
export const EASY_MULTIPLIER = 1.06

const STORAGE_VIEW = "lvb-view"
const STORAGE_TEXT = "lvb-text"

type ChiefSettings = {
  viewMode: ViewMode
  textSize: TextSize
  setViewMode: (v: ViewMode) => void
  setTextSize: (s: TextSize) => void
  /** lvb-main 의 inline zoom 값 (보기 모드와 글자 크기 조합). */
  zoom: number
  /** lvb-main 의 className 확장 (".lvb-easy" 가 붙음 / 안 붙음). */
  mainClass: string
}

const Ctx = createContext<ChiefSettings | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeRaw] = useState<ViewMode>("standard")
  const [textSize, setTextSizeRaw] = useState<TextSize>("보통")

  // mount 시 localStorage 복원.
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const v = window.localStorage.getItem(STORAGE_VIEW) as ViewMode | null
      const t = window.localStorage.getItem(STORAGE_TEXT) as TextSize | null
      if (v === "easy" || v === "standard") setViewModeRaw(v)
      if (t === "보통" || t === "크게" || t === "아주 크게") setTextSizeRaw(t)
    } catch {}
  }, [])

  const setViewMode = useCallback((v: ViewMode) => {
    setViewModeRaw(v)
    try {
      window.localStorage.setItem(STORAGE_VIEW, v)
    } catch {}
  }, [])

  const setTextSize = useCallback((s: TextSize) => {
    setTextSizeRaw(s)
    try {
      window.localStorage.setItem(STORAGE_TEXT, s)
    } catch {}
  }, [])

  const zoom = (TEXT_ZOOM[textSize] || 1) * (viewMode === "easy" ? EASY_MULTIPLIER : 1)
  const mainClass = viewMode === "easy" ? "lvb-easy" : ""

  const value = useMemo(
    () => ({ viewMode, textSize, setViewMode, setTextSize, zoom, mainClass }),
    [viewMode, textSize, setViewMode, setTextSize, zoom, mainClass],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useChiefSettings(): ChiefSettings {
  const v = useContext(Ctx)
  if (!v) {
    throw new Error(
      "useChiefSettings 는 <SettingsProvider> 안에서만 호출할 수 있어요. Shell 이 둘러쌌는지 확인하세요.",
    )
  }
  return v
}
