"use client";

/**
 * ProcessingInbox — 처리함 row 리스트(lvb-list/lvb-row).
 *
 * chips·greeting 은 ChiefDashboard 가 담당. 여기서는 InboxItem[] 를 순서 그대로 리스트로.
 */

import { ChevronRight, Send, Camera, HeartHandshake, RefreshCw, Bell, Clock } from "lucide-react";
import { type InboxItem } from "./chief-ui";

interface ProcessingInboxProps {
  items: InboxItem[];
  onPrimary: (item: InboxItem, opts?: { retake?: boolean }) => void;
  onOpenFarmer: (farmerId: string) => void;
}

const KIND_ICON = {
  review: Camera,
  nudge: Bell,
  helper: HeartHandshake,
};

const URGENCY_LABEL = {
  over: { label: "마감 지남", tone: "danger" as const },
  today: { label: "오늘 처리", tone: "warn" as const },
  week: { label: "이번 주", tone: "warn" as const },
  soon: { label: "여유", tone: "neutral" as const },
};

function primaryAction(item: InboxItem) {
  if (item.kind === "review") {
    if (item.evidence?.quality === "blurry") {
      return { label: "다시 받기 요청", Icon: RefreshCw, retake: true };
    }
    return { label: "사진 보기", Icon: Camera, retake: false };
  }
  if (item.kind === "nudge") return { label: "문자로 알려주기", Icon: Send, retake: false };
  return { label: "도우미 연결", Icon: HeartHandshake, retake: false };
}

export default function ProcessingInbox({ items, onPrimary, onOpenFarmer }: ProcessingInboxProps) {
  if (items.length === 0) {
    return (
      <div className="lvb-allclear">
        <span>✓</span> 오늘 이 종류 일은 다 처리했어요.
      </div>
    );
  }

  return (
    <ul className="lvb-list">
      {items.map((item) => {
        const KindIcon = KIND_ICON[item.kind];
        const pa = primaryAction(item);
        const PrimaryIcon = pa.Icon;
        const urg = URGENCY_LABEL[item.urgency];
        const tone = `t-${item.kind}`;
        return (
          <li key={item.id} className="lvb-row">
            <span className={`lvb-row-kind ${tone}`}><KindIcon size={18} /></span>
            <div className="lvb-row-main">
              <div className="lvb-row-nameline">
                <button
                  type="button"
                  className="lvb-row-name"
                  onClick={() => onOpenFarmer(item.farmer.id)}
                >
                  {item.farmer.name}
                </button>
                {item.projTag && (
                  <span className="lvb-projtag t-green">{item.projTag.label}</span>
                )}
                <span
                  className={`lvb-tag lvb-tag-${urg.tone}`}
                >
                  {urg.label}
                </span>
                {item.evidence?.needsChiefVerification && (
                  <span className="lvb-tag lvb-tag-warn">AI 확신 낮음</span>
                )}
              </div>
              <div className="lvb-row-title">{item.title}</div>
              <div className="lvb-row-sub">
                {item.dueText && (
                  <span className="lvb-row-due">
                    <Clock size={13} />
                    {item.dueText}
                  </span>
                )}
                {item.sub && <span>{item.sub}</span>}
              </div>
            </div>
            <div className="lvb-row-actions">
              <button
                type="button"
                className="lvb-btn lvb-btn-primary lvb-btn-md"
                onClick={() => onPrimary(item, pa.retake ? { retake: true } : undefined)}
              >
                <PrimaryIcon size={19} />
                <span>{pa.label}</span>
              </button>
              <button
                type="button"
                className="lvb-btn lvb-btn-outline lvb-btn-md"
                onClick={() => onOpenFarmer(item.farmer.id)}
              >
                <span>농가 보기</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
