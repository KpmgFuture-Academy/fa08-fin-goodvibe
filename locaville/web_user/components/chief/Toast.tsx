"use client"

/**
 * 토스트 — 액션 후 한 줄 안내 (lvb-toast).
 *
 * showToast(msg) 로 띄우면 2.6초 후 자동 사라짐. 스크린리더에 aria-live 로 동시 알림.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle } from "lucide-react"

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  const show = useCallback((text: string) => {
    setMsg(text)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2600)
  }, [])
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])
  return { msg, show }
}

export default function Toast({ msg }: { msg: string | null }) {
  return (
    <>
      <div className="lvb-toast-live lvb-sr" role="status" aria-live="polite">
        {msg || ""}
      </div>
      {msg && (
        <div className="lvb-toast" aria-hidden="true">
          <CheckCircle size={18} />
          {msg}
        </div>
      )}
    </>
  )
}
