"use client"

/**
 * 마을주민 목록 표.
 *
 * 컬럼: 이름 / 휴대폰 / 가입상태 / 참여사업 / 참여단체 / 최근기록 / 누락항목 / 상세.
 * "초대발송 / 재발송" 버튼은 amoRegno 가 있는 (backend 연동된) 주민만 backend
 * POST `/admin/residents/{amo_regno}/invite` 호출. mock fallback 주민은 alert() 만.
 *
 * 실제 SMS / 카카오 알림톡 발송은 별도 인프라 — 지금은 user_master.status_cd 만 'INV'.
 */
import { useState } from "react"

import { inviteResident } from "@/lib/admin-api"
import type { Resident } from "@/lib/residents-types"

// 기존 호출자가 `@/components/residents/ResidentListTable` 에서 type 도 함께
// import 하던 패턴을 깨지 않게 재-export.
export type { ParcelCrop, Resident } from "@/lib/residents-types"

export default function ResidentListTable({
  residents,
  onSelectDetail,
  onInvited,
}: {
  residents: Resident[]
  onSelectDetail?: (resident: Resident) => void
  /** 수정은 상세 페이지 안에서 처리 — 표에서는 노출하지 않음. */
  onInvited?: () => void
}) {
  const [invitingId, setInvitingId] = useState<number | null>(null)

  async function handleInvite(resident: Resident) {
    if (!resident.amoRegno) {
      window.alert("초대 링크를 발송했습니다. (샘플 주민이라 backend 기록은 안 됩니다)")
      return
    }
    setInvitingId(resident.id)
    try {
      await inviteResident(resident.amoRegno)
      window.alert(`${resident.name} 님에게 초대 표시를 저장했습니다.`)
      onInvited?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "초대 실패"
      window.alert(`초대 실패: ${msg}`)
    } finally {
      setInvitingId(null)
    }
  }

  return (
    <div className="resident-table-wrap">
      <table className="resident-table">
        <thead>
          <tr>
            <th>이름</th>
            <th>휴대폰번호</th>
            <th>가입상태</th>
            <th>참여사업</th>
            <th>참여단체</th>
            <th>최근기록</th>
            <th>누락항목</th>
            <th>상세</th>
          </tr>
        </thead>
        <tbody>
          {residents.length > 0 ? (
            residents.map((resident) => (
              <tr key={resident.id}>
                <td className="cell-name">{resident.name}</td>
                <td className="cell-mono">{resident.phone}</td>
                <td>
                  <span className={`resident-status resident-status-${resident.signupStatus}`}>
                    {resident.signupStatus}
                  </span>
                  {resident.statusAction && (
                    <button
                      type="button"
                      className="resident-action resident-action-invite"
                      onClick={() => handleInvite(resident)}
                      disabled={invitingId === resident.id}
                    >
                      {invitingId === resident.id ? "발송 중..." : resident.statusAction}
                    </button>
                  )}
                </td>
                <td>{resident.project}</td>
                <td>{resident.group}</td>
                <td className="cell-mono">{resident.recentRecord || ""}</td>
                <td className={resident.missingItems ? "resident-missing-count" : ""}>{resident.missingItems || ""}</td>
                <td>
                  {resident.signupStatus === "가입완료" && (
                    <div className="resident-table-actions">
                      <button
                        type="button"
                        className="resident-action resident-action-detail"
                        onClick={() => onSelectDetail?.(resident)}
                      >
                        상세
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="tbl-empty">
                검색 결과가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
