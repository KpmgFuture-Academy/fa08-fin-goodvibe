/**
 * "이런 사진을 받아야 해요" 카드.
 * 마을의 confirmed evidence 중 활동에 맞는 사진을 우선 노출. 없으면 placeholder + 짧은 가이드.
 */
import { Camera, Image as ImageIcon } from "lucide-react"
import { Card, CardBody, CardHead } from "@/components/ui/Card"
import type { ActivityStats } from "@/lib/dashboard-activity"
import { resolveImageUrl } from "@/lib/image-url"

export function ExampleEvidenceCard({ stats }: { stats: ActivityStats }) {
  const example = stats.exampleEvidence
  const farmerName = example?.farmer_name || example?.farmer_id || ""
  // 1순위: 실제 농가가 올린 사진. 없으면 활동별 기본 예시(모범) 사진.
  const realSrc = resolveImageUrl(example?.image_url)
  const imgSrc = realSrc || stats.activity.exampleImage || ""
  const isExample = !realSrc && Boolean(stats.activity.exampleImage)
  return (
    <Card>
      <CardHead title="이런 사진을 받아야 해요" sub={stats.activity.name} />
      <CardBody>
        <div className="example-photo">
          {imgSrc ? (
            <img src={imgSrc} alt={`${stats.activity.name} 모범 사진`} loading="lazy" />
          ) : (
            <div className="example-placeholder">
              <Camera size={48} />
              <div className="example-placeholder-title">예시 사진 준비 중</div>
              <div className="example-placeholder-desc">
                아직 모범 사진이 등록되지 않았어요.<br />
                농가가 사진을 올리면 여기에 표시됩니다.
              </div>
            </div>
          )}
        </div>
        <p className="example-guide">{stats.activity.shortGuide}</p>
        {imgSrc &&
          (isExample ? (
            <p className="example-credit">
              <ImageIcon size={14} /> 예시로 보여드리는 모범 사진이에요
            </p>
          ) : farmerName ? (
            <p className="example-credit">
              <ImageIcon size={14} /> {farmerName} 농가가 등록한 사진
            </p>
          ) : null)}
      </CardBody>
    </Card>
  )
}
