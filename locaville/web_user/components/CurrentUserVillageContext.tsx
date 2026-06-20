"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { CurrentUserVillageInfo } from "@/lib/user-village-context-types"

export type CurrentUserVillageContextValue = {
  currentUserVillageInfo: CurrentUserVillageInfo | null
  loading: boolean
  error: string
  refresh: () => Promise<void>
}

const CurrentUserVillageContext = createContext<CurrentUserVillageContextValue | null>(null)

export function CurrentUserVillageProvider({
  children,
  value,
}: {
  children: ReactNode
  value: CurrentUserVillageContextValue
}) {
  return (
    <CurrentUserVillageContext.Provider value={value}>
      {children}
    </CurrentUserVillageContext.Provider>
  )
}

export function useCurrentUserVillage() {
  const context = useContext(CurrentUserVillageContext)
  if (!context) {
    throw new Error("useCurrentUserVillage must be used within CurrentUserVillageProvider")
  }
  return context
}
