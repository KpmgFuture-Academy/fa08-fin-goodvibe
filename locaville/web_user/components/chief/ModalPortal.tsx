"use client"

/**
 * 모달 / 팝업 portal — `document.body` 에 직접 mount.
 *
 * Shell 의 `lvb-main` 에 inline `zoom` 이 걸려 있어서, 그 안의 `position: fixed`
 * 가 viewport 가 아닌 zoom 컨테이너 기준으로 잡힌다. 모달을 lvb-main 바깥의
 * body 자손으로 mount 해야 화면 정중앙에 정확히 떠 보임.
 *
 * SSR-safe: mount 전엔 null. open=false 면 unmount.
 */
import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

export default function ModalPortal({
  open,
  children,
}: {
  open: boolean
  children: ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || !open) return null
  return createPortal(children, document.body)
}
