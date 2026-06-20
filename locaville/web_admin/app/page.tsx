"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { LockKeyhole, UserRound } from "lucide-react"
import { loginAdmin } from "@/lib/admin-auth-api"
import { readAdminSession, saveAdminSession } from "@/lib/admin-auth-storage"

export default function HomePage() {
  const router = useRouter()
  const [loginId, setLoginId] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const session = readAdminSession()
    if (session) {
      router.replace("/project")
    }
  }, [router])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError("")

    try {
      const admin = await loginAdmin({
        login_id: loginId.trim(),
        password,
      })
      const saved = saveAdminSession(admin)
      if (!saved) {
        throw new Error("브라우저 저장소에 로그인 정보를 저장하지 못했습니다.")
      }
      window.location.replace("/project")
    } catch (e) {
      const message = e instanceof Error ? e.message : "로그인에 실패했습니다."
      setError(message)
      window.alert(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="login-brand">
          <div className="login-badge">WEB ADMIN</div>
          <h1>저탄마을 프로젝트 관리</h1>
          <p>관리자 계정으로 로그인한 뒤 프로젝트 관리 화면으로 이동합니다.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>로그인 ID</span>
            <div className="login-input-wrap">
              <UserRound size={18} />
              <input
                type="text"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                placeholder="로그인 ID를 입력하세요"
                autoComplete="username"
                disabled={submitting}
              />
            </div>
          </label>

          <label className="login-field">
            <span>비밀번호</span>
            <div className="login-input-wrap">
              <LockKeyhole size={18} />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호를 입력하세요"
                autoComplete="current-password"
                disabled={submitting}
              />
            </div>
          </label>

          {error ? <div className="alert alert-error">오류: {error}</div> : null}

          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? "로그인 확인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  )
}
