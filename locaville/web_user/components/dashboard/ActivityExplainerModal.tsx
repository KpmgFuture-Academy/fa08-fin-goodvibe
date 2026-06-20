"use client"

/**
 * "{활동}이/가 뭔가요?" 모달.
 * 4섹션 (무엇인가요 / 왜 하나요 / 농가가 해야 할 일 / 어떤 사진을 찍어야 하나요).
 * 활동별 메타데이터는 `lib/activities.ts` 의 정적 매핑에서 가져옴.
 */
import { Modal } from "@/components/ui/Modal"
import { Btn } from "@/components/ui/Btn"
import type { ActivityDef } from "@/lib/activities"
import { subjectParticle } from "@/lib/labels"

export function ActivityExplainerModal({
  open,
  activity,
  onClose,
}: {
  open: boolean
  activity: ActivityDef
  onClose: () => void
}) {
  return (
    <Modal
      open={open}
      title={`${activity.name}${subjectParticle(activity.name)} 뭔가요?`}
      onClose={onClose}
      width="640px"
      footer={
        <Btn variant="primary" size="lg" onClick={onClose} fullWidth>
          알겠어요
        </Btn>
      }
    >
      <section className="explainer">
        <div className="explainer-section">
          <h3>무엇인가요?</h3>
          <p>{activity.explainer.what}</p>
        </div>

        <div className="explainer-section">
          <h3>왜 하나요?</h3>
          <p>{activity.explainer.why}</p>
        </div>

        <div className="explainer-section">
          <h3>농가가 해야 할 일</h3>
          <ol>
            {activity.explainer.farmerTasks.map((task, i) => (
              <li key={i}>{task}</li>
            ))}
          </ol>
        </div>

        <div className="explainer-section">
          <h3>어떤 사진을 찍어야 하나요?</h3>
          <ul>
            {activity.explainer.photoTips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      </section>
    </Modal>
  )
}
