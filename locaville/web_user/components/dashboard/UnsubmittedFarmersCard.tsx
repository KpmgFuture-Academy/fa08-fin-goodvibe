"use client"

/**
 * "미제출 농가 N곳" 카드.
 *
 * 5명 미리보기 + "더 보기" 모달 (전체 명단). 인원수는 분모 없이 표시
 * (backend 가 마을 총 농가 수를 신뢰 가능하게 알려주지 않으므로).
 */
import { useState } from "react"
import { ChevronRight, Users } from "lucide-react"
import { Card, CardBody, CardHead } from "@/components/ui/Card"
import { Btn } from "@/components/ui/Btn"
import type { ActivityStats, FarmerRef } from "@/lib/dashboard-activity"
import { Modal } from "@/components/ui/Modal"

function FarmerRow({ ref: f }: { ref: FarmerRef }) {
  const label = f.farmer_name || f.farmer_id
  return (
    <div className="unsub-row">
      <div className="unsub-row-name">{label}</div>
      {f.farmer_name && f.farmer_id !== f.farmer_name && (
        <div className="unsub-row-id">{f.farmer_id}</div>
      )}
    </div>
  )
}

export function UnsubmittedFarmersCard({ stats }: { stats: ActivityStats }) {
  const [showAll, setShowAll] = useState(false)
  const all = stats.unsubmittedFarmers
  const preview = all.slice(0, 5)

  return (
    <Card>
      <CardHead
        title={`미제출 농가 ${all.length}곳`}
        sub={stats.activity.name}
      />
      <CardBody>
        {all.length === 0 ? (
          <div className="unsub-empty">
            <Users size={32} />
            <div>모든 농가가 증빙을 제출했어요.</div>
          </div>
        ) : (
          <>
            <div className="unsub-list">
              {preview.map((f) => (
                <FarmerRow key={f.farmer_id} ref={f} />
              ))}
            </div>
            {all.length > preview.length && (
              <Btn
                variant="outline"
                size="md"
                icon={<ChevronRight size={16} />}
                onClick={() => setShowAll(true)}
                fullWidth
              >
                {all.length - preview.length}명 더 보기
              </Btn>
            )}
          </>
        )}
      </CardBody>

      <Modal
        open={showAll}
        title={`미제출 농가 전체 (${all.length}곳)`}
        onClose={() => setShowAll(false)}
        width="480px"
      >
        <div className="unsub-list unsub-list-full">
          {all.map((f) => (
            <FarmerRow key={f.farmer_id} ref={f} />
          ))}
        </div>
      </Modal>
    </Card>
  )
}
