"use client";

/**
 * ChiefDashboard — 처리함 중심 레이아웃 조립 골격(좌: 처리함 / 우: 마을 진행률).
 * 데이터는 page 에서 lib/admin-api 로 채워 주입. 모달 열림 상태만 여기서 관리.
 */

import { useState } from "react";
import ProcessingInbox from "./ProcessingInbox";
import VillagePulse, { type VillagePulseData } from "./VillagePulse";
import { ReviewModal, NudgeModal, HelperModal } from "./ChiefModals";
import type { InboxItem, Farmer } from "./chief-ui";

type Modal =
  | { type: "review"; item: InboxItem; mode?: "view" | "retake" }
  | { type: "nudge"; item: InboxItem }
  | { type: "helper"; farmer: Farmer }
  | null;

export interface ChiefDashboardData {
  items: InboxItem[];
  pulse: VillagePulseData;
  memo: string;
  residents: Farmer[];              // 마을 주민 전체(도우미 선택용)
  appliedHelperByFarmer: Record<string, string>; // 농가가 직접 신청한 도우미
  nudgeTextFor: (item: InboxItem) => string;     // 기본 문자 문구
  resolveImg?: (img: string) => string | undefined;
}

export default function ChiefDashboard({
  data,
  onReviewDone, onNudgeSend, onHelperConnect, onOpenFarmer, onSeeVillage, onPlayMemo,
}: {
  data: ChiefDashboardData;
  onReviewDone: (p: { type: "confirm" | "retake"; evidence?: string; reason?: string }) => void;
  onNudgeSend: (p: { type: "nudge"; farmer: string; text: string }) => void;
  onHelperConnect: (p: { type: "helper"; farmer: string; helper: string }) => void;
  onOpenFarmer: (id: string) => void;
  onSeeVillage: () => void;
  onPlayMemo?: () => void;
}) {
  const [modal, setModal] = useState<Modal>(null);
  const close = () => setModal(null);

  function onPrimary(item: InboxItem, opts?: { retake?: boolean }) {
    if (item.kind === "review") setModal({ type: "review", item, mode: opts?.retake ? "retake" : "view" });
    else if (item.kind === "nudge") setModal({ type: "nudge", item });
    else setModal({ type: "helper", farmer: item.farmer });
  }

  return (
    <div className="lvb-root flex gap-6 bg-[var(--lvb-bg)] p-6">
      <ProcessingInbox items={data.items} onPrimary={onPrimary} onOpenFarmer={onOpenFarmer} />
      <VillagePulse pulse={data.pulse} memo={data.memo} onSeeVillage={onSeeVillage} onPlayMemo={onPlayMemo} />

      {modal?.type === "review" && (
        <ReviewModal item={modal.item} imgSrc={data.resolveImg?.(modal.item.evidence?.img ?? "")} initialMode={modal.mode}
          onClose={close} onDone={(p) => { close(); onReviewDone(p); }} />
      )}
      {modal?.type === "nudge" && (
        <NudgeModal item={modal.item} defaultText={data.nudgeTextFor(modal.item)}
          onClose={close} onDone={(p) => { close(); onNudgeSend(p); }} />
      )}
      {modal?.type === "helper" && (
        <HelperModal farmer={modal.farmer}
          residents={data.residents.filter((r) => r.id !== modal.farmer.id)}
          appliedHelperName={data.appliedHelperByFarmer[modal.farmer.id] ?? null}
          onClose={close} onDone={(p) => { close(); onHelperConnect(p); }} />
      )}
    </div>
  );
}

/* Claude Code: 기존 Shell/Sidebar 안에 이 대시보드를 끼우고, data 를
   getRecentEvidence/getLaggardFarmers/listFarmHelpers + 주민 명단으로 조립.
   onReviewDone/onNudgeSend/onHelperConnect → admin-api 호출 후 데이터 무효화. */
