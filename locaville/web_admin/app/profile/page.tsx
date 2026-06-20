"use client"

import { useCallback, useEffect, useState } from "react"
import { Save } from "lucide-react"
import { PageHeader } from "@/components/ui/PageHeader"
import { Card, CardBody, CardHead } from "@/components/ui/Card"
import { Btn } from "@/components/ui/Btn"
import { readAdminSession } from "@/lib/admin-auth-storage"
import {
  getAdminProfile,
  updateAdminProfile,
  ADMIN_PROFILE_CONNECTION_ERROR_MESSAGE,
  type AdminProfile,
} from "@/lib/admin-profile-api"

export default function ProfilePage() {
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [phoneNo, setPhoneNo] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const load = useCallback(async () => {
    const session = readAdminSession()
    if (!session?.admin_no) {
      setError("로그인된 관리자 정보를 찾을 수 없습니다.")
      setLoading(false)
      return
    }

    setLoading(true)
    setError("")
    try {
      const data = await getAdminProfile(session.admin_no)
      setProfile(data)
      setPhoneNo(data.phone_no || "")
      setEmail(data.email || "")
    } catch (e) {
      setError(e instanceof Error ? e.message : ADMIN_PROFILE_CONNECTION_ERROR_MESSAGE)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave() {
    if (!profile?.admin_no) return
    setSaving(true)
    setError("")
    setNotice("")
    try {
      const updated = await updateAdminProfile(profile.admin_no, {
        phone_no: phoneNo,
        email,
        password: password.trim() ? password : undefined,
      })
      setProfile(updated)
      setPhoneNo(updated.phone_no || "")
      setEmail(updated.email || "")
      setPassword("")
      setNotice("관리자 정보가 수정되었습니다.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "관리자 정보를 수정하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="정보수정"
        sub="현재 로그인한 관리자 계정의 비밀번호, 전화번호, 이메일을 수정합니다."
        backHref="/project"
      />

      {error ? <div className="alert alert-error">오류: {error}</div> : null}
      {notice ? <div className="alert alert-notice">{notice}</div> : null}

      <Card>
        <CardHead title="관리자 계정 정보" sub="비밀번호는 저장 시 bcrypt 60자리 해시로 변환됩니다." />
        <CardBody>
          {loading ? (
            <div className="loading">불러오는 중...</div>
          ) : profile ? (
            <div className="profile-form">
              <div className="resident-add-field">
                <span>로그인 ID</span>
                <input value={profile.login_id || ""} disabled />
              </div>
              <div className="resident-add-field">
                <span>관리자명</span>
                <input value={profile.name || ""} disabled />
              </div>
              <div className="resident-add-field">
                <span>전화번호</span>
                <input
                  value={phoneNo}
                  onChange={(event) => setPhoneNo(event.target.value)}
                  placeholder="전화번호를 입력하세요"
                  disabled={saving}
                />
              </div>
              <div className="resident-add-field">
                <span>이메일</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="이메일을 입력하세요"
                  disabled={saving}
                />
              </div>
              <div className="resident-add-field">
                <span>새 비밀번호</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="변경할 때만 입력하세요"
                  autoComplete="new-password"
                  disabled={saving}
                />
              </div>

              <div className="profile-form-actions">
                <Btn
                  variant="primary"
                  icon={<Save size={16} />}
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  {saving ? "저장 중..." : "저장"}
                </Btn>
              </div>
            </div>
          ) : (
            <div className="tbl-empty muted" style={{ padding: 48 }}>
              관리자 정보를 찾을 수 없습니다.
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
