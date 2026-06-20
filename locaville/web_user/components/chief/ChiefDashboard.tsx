"use client";

/**
 * ChiefDashboard — 처리함 중심 조립.
 *
 * 표준 보기: 좌측(처리함) + 우측 sticky 사이드(메모+마을 진행률).
 * 쉬운 보기: 한 컬럼, 우측 사이드 숨기고 본문 상단에 메모 strip.
 *
 * SettingsContext 가 viewMode 를 결정 — CSS class cascade 대신 React 조건부 렌더로
 * 확실히 동작하게 한다.
 */

import { useMemo, useState } from "react";
import { Sun, Volume2 } from "lucide-react";
import { useChiefSettings } from "@/components/SettingsContext";
import ProcessingInbox from "./ProcessingInbox";
import VillagePulse, { type VillagePulseData } from "./VillagePulse";
import MemoCard, { splitSentences } from "./MemoCard";
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
  residents: Farmer[];
  appliedHelperByFarmer: Record<string, string>;
  nudgeTextFor: (item: InboxItem) => string;
  resolveImg?: (img: string) => string | undefined;
}

type Filter = "all" | "review" | "nudge";

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
  const settings = useChiefSettings();
  const isEasy = settings.viewMode === "easy";

  const [modal, setModal] = useState<Modal>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const close = () => setModal(null);

  function onPrimary(item: InboxItem, opts?: { retake?: boolean }) {
    if (item.kind === "review") setModal({ type: "review", item, mode: opts?.retake ? "retake" : "view" });
    else if (item.kind === "nudge") setModal({ type: "nudge", item });
    else setModal({ type: "helper", farmer: item.farmer });
  }

  // helper 종류는 처리함에 표시 안 함 — 카운트에서 제외.
  const counts = useMemo(() => {
    const c = { all: 0, review: 0, nudge: 0 };
    for (const i of data.items) {
      if (i.kind === "helper") continue;
      c.all += 1;
      if (i.kind === "review" || i.kind === "nudge") c[i.kind] += 1;
    }
    return c;
  }, [data.items]);

  const visible = useMemo(() => {
    const noHelper = data.items.filter((i) => i.kind !== "helper");
    return filter === "all" ? noHelper : noHelper.filter((i) => i.kind === filter);
  }, [data.items, filter]);

  const remaining = counts.all;
  const chips: [Filter, string, number][] = [
    ["all", "전체", counts.all],
    ["review", "사진 확인", counts.review],
    ["nudge", "알려줄 일", counts.nudge],
  ];

  // 쉬운 보기 = 한 컬럼. 표준 보기 = 본문 + 우측 sticky 사이드.
  // 그리드는 CSS(.lvb-home-stream)가 담당 — 화면 폭에 따라 자동으로 한 컬럼으로 접힌다(반응형).
  // 쉬운 보기는 자체 modifier 클래스로 한 컬럼 고정(상위 .lvb-easy cascade 에 의존 X).
  return (
    <div className={`lvb-home lvb-home-stream${isEasy ? " lvb-home-stream--easy" : ""}`}>
      <div className="lvb-stream-main">
        {/* 쉬운 보기 일 때만 본문 상단에 가로 메모 strip 노출 */}
        {isEasy && (
          <div
            className="lvb-easy-memo"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              background: "var(--lvb-accent-soft)",
              borderRadius: 14,
              padding: "15px 17px",
              marginBottom: 16,
            }}
          >
            <span className="lvb-memo-ic" style={{ flexShrink: 0 }}>
              <Sun size={15} />
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 }}>
              {splitSentences(data.memo).map((s, i) => (
                <p
                  key={i}
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 600,
                    lineHeight: 1.55,
                    color: "var(--lvb-ink-soft)",
                    wordBreak: "keep-all",
                  }}
                >
                  {s}
                </p>
              ))}
            </div>
            {/* 쉬운 보기 — 메모를 음성으로 읽어주는 큰 버튼(어르신 시인성). */}
            {onPlayMemo && (
              <button
                type="button"
                onClick={onPlayMemo}
                aria-label="오늘 마을 메모 음성으로 읽어주기"
                style={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "16px 24px",
                  borderRadius: 16,
                  background: "var(--lvb-accent)",
                  color: "#fff",
                  border: "none",
                  fontSize: 20,
                  fontWeight: 800,
                  lineHeight: 1.2,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 14px rgba(47,109,79,0.30)",
                }}
              >
                <Volume2 size={28} />
                음성으로 읽어주기
              </button>
            )}
          </div>
        )}

        <div className="lvb-home-greet">
          <h1>
            {remaining > 0 ? (
              <>오늘 처리할 일이 <b>{remaining}건</b> 있어요</>
            ) : (
              "오늘 처리할 일을 모두 끝냈어요"
            )}
          </h1>
          <p>
            {remaining > 0
              ? "마감 지난 일부터 위에 모아 보여드려요. 위에서부터 처리하시면 돼요."
              : "수고하셨어요. 마을이 잘 돌아가고 있어요."}
          </p>
        </div>

        <div className="lvb-chips" role="group" aria-label="처리함 거르기">
          {chips.map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              className={`lvb-chip${filter === k ? " is-on" : ""}`}
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
            >
              {label}
              <span className="lvb-chip-n">{n}</span>
            </button>
          ))}
        </div>

        <ProcessingInbox items={visible} onPrimary={onPrimary} onOpenFarmer={onOpenFarmer} />
      </div>

      {/* 표준 보기에만 우측 사이드 패널 (React 조건부 렌더 — CSS rule 의존 X) */}
      {!isEasy && (
        <aside className="lvb-stream-side">
          <MemoCard memo={data.memo} onPlay={onPlayMemo} />
          <VillagePulse pulse={data.pulse} onSeeVillage={onSeeVillage} />
        </aside>
      )}

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
