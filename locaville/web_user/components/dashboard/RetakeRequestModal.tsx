"use client"

/**
 * "재촬영 요청" 모달. 이장님이 사진이 부족하다고 판단한 증빙에 메시지를 남길 때 사용.
 *
 * 저장하면 `PATCH /evidence/{id}` 로 `status=retake_required` + `user_message` 갱신.
 * **자동 문자/카톡 발송 안 됨** — 메시지는 농가가 v0_farmer 에서 직접 확인.
 */
import { useEffect, useState } from "react"
import { Save } from "lucide-react"
import { Modal } from "@/components/ui/Modal"
import { Btn } from "@/components/ui/Btn"

const DEFAULT_MESSAGE =
  "사진이 흐릿하거나 필요한 부분이 잘 보이지 않습니다. 같은 위치에서 한 번 더 찍어 올려 주세요."

export function RetakeRequestModal({
  open,
  farmerLabel,
  evidenceLabel,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  farmerLabel: string
  evidenceLabel: string
  saving: boolean
  onClose: () => void
  onSubmit: (message: string) => void | Promise<void>
}) {
  const [message, setMessage] = useState(DEFAULT_MESSAGE)

  useEffect(() => {
    if (open) setMessage(DEFAULT_MESSAGE)
  }, [open])

  function handleSubmit() {
    const trimmed = message.trim()
    if (!trimmed || saving) return
    void onSubmit(trimmed)
  }

  return (
    <Modal
      open={open}
      title="재촬영 요청"
      onClose={saving ? () => {} : onClose}
      width="540px"
      footer={
        <div className="retake-footer">
          <Btn variant="outline" size="md" onClick={onClose} disabled={saving}>
            취소
          </Btn>
          <Btn
            variant="primary"
            size="lg"
            icon={<Save size={18} />}
            onClick={handleSubmit}
            disabled={saving || !message.trim()}
          >
            {saving ? "저장 중..." : "메시지 저장"}
          </Btn>
        </div>
      }
    >
      <div className="retake-body">
        <p className="retake-meta">
          <strong>{farmerLabel}</strong>님에게 <strong>{evidenceLabel}</strong>의 재촬영을 요청합니다.
        </p>
        <label className="retake-label" htmlFor="retake-message">
          어떤 부분을 다시 찍어달라고 안내할까요?
        </label>
        <textarea
          id="retake-message"
          className="retake-textarea"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          spellCheck={false}
        />
        <p className="retake-note">
          이 메시지는 농가가 앱에서 직접 확인할 수 있습니다. 자동 문자·카카오톡 발송 기능은 없습니다.
        </p>
      </div>
    </Modal>
  )
}
