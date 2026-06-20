"use client"

/**
 * 영농일지 1건 상세 모달.
 *
 * 일지 row 에 연결된 첫 evidence 를 `getEvidenceById` 로 1건 fetch 해
 * `image_url` 을 `resolveImageUrl` 로 절대 경로 변환 후 사진을 표시.
 * 사진이 없거나 evidence fetch 실패 시 placeholder 안내를 보여줍니다.
 */
import { useEffect, useState } from "react"

import type { FarmingLog } from "@/components/residents/ResidentDetailPage"
import type { Resident } from "@/components/residents/ResidentListTable"
import { Btn } from "@/components/ui/Btn"
import { Modal } from "@/components/ui/Modal"
import { getEvidenceById } from "@/lib/admin-api"
import type { AdminEvidenceItem } from "@/lib/admin-types"
import { resolveImageUrl } from "@/lib/image-url"

export default function FarmingLogDetailModal({
  open,
  log,
  resident,
  onClose,
}: {
  open: boolean
  log: FarmingLog | null
  resident: Resident
  onClose: () => void
}) {
  const [evidence, setEvidence] = useState<AdminEvidenceItem | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState("")

  // 일지의 첫 evidence(증빙 사진) 1건 fetch — 사진 없는 일지는 그대로 빈 상태.
  useEffect(() => {
    if (!open || !log) {
      setEvidence(null)
      setEvidenceError("")
      return
    }
    const firstId = log.evidenceIds?.[0]
    if (!firstId) {
      setEvidence(null)
      setEvidenceError("")
      return
    }
    let cancelled = false
    setEvidenceLoading(true)
    setEvidenceError("")
    void getEvidenceById(firstId)
      .then((item) => {
        if (!cancelled) setEvidence(item)
      })
      .catch((e) => {
        if (!cancelled) {
          setEvidenceError(e instanceof Error ? e.message : "사진을 불러오지 못했습니다.")
          setEvidence(null)
        }
      })
      .finally(() => {
        if (!cancelled) setEvidenceLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, log])

  if (!log) return null

  const author = log.author || resident.name || "—"
  const taskName = log.taskName || "—"
  const farmerNote = log.farmerNote || "—"
  const projectName = log.projectName || "—"

  const photoCaptureDt = evidence?.captured_at || ""
  const photoAddress =
    log.fieldAddress || (evidence as (AdminEvidenceItem & { address?: string }) | null)?.address || "—"
  const photoParcel = log.parcelNo ? `${log.parcelNo}번 필지` : "—"
  const photoSrc = resolveImageUrl(evidence?.image_url)
  const photoName = evidence?.image_url ? evidence.image_url.split("/").pop() || "사진" : "—"

  return (
    <Modal
      open={open}
      title="영농일지 상세"
      onClose={onClose}
      width="920px"
      footer={
        <div className="farming-log-detail-footer">
          <Btn variant="primary" onClick={onClose}>
            확인
          </Btn>
        </div>
      }
    >
      <div className="farming-log-detail-layout">
        <table className="farming-log-detail-table">
          <tbody>
            <tr>
              <th>작성자</th>
              <td>{author}</td>
            </tr>
            <tr>
              <th>일시</th>
              <td>{log.datetime}</td>
            </tr>
            <tr>
              <th>사업별 할일</th>
              <td>{taskName}</td>
            </tr>
            <tr>
              <th>주민 기록</th>
              <td>{farmerNote}</td>
            </tr>
            <tr>
              <th>사진</th>
              <td>{photoName}</td>
            </tr>
            <tr>
              <th>참여사업</th>
              <td>{projectName}</td>
            </tr>
          </tbody>
        </table>

        <figure className="farming-log-photo">
          {evidenceLoading ? (
            <div style={{ padding: 32, textAlign: "center" }}>사진 불러오는 중...</div>
          ) : photoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoSrc} alt="영농 증빙 사진" />
          ) : (
            <div style={{ padding: 32, textAlign: "center", color: "#999" }}>
              {evidenceError ? `사진 불러오기 실패: ${evidenceError}` : "등록된 사진이 없습니다."}
            </div>
          )}
          <figcaption>
            {photoCaptureDt && <span>촬영일시: {photoCaptureDt}</span>}
            <span>촬영위치: {photoAddress}</span>
            <span>필지: {photoParcel}</span>
            <span>할일: {taskName}</span>
            <span>참여사업: {projectName}</span>
            <span>등록자: {author}</span>
          </figcaption>
        </figure>
      </div>
    </Modal>
  )
}
