"use client";

/**
 * ProcessingInbox — 이장님 대시보드의 중심 "처리함".
 * 사진확인·알려줄일·도움연결을 한 큐에 섞어 위에서부터 처리하는 순서표.
 * 필터 칩으로 종류별 좁혀보기. 각 줄에 1순위 행동 버튼.
 */

import { useMemo, useState } from "react";
import {
  Btn, Tag, type InboxItem, type InboxKind, KIND_META, URGENCY_LABEL, STATE_LABEL,
  Camera, Send, HeartHandshake, RefreshCw, ChevronRight,
} from "./chief-ui";

type Filter = "all" | InboxKind;

interface ProcessingInboxProps {
  items: InboxItem[];
  /** 한 줄의 1순위 행동. opts.retake = 흐린 사진 → 바로 재촬영 모드로. */
  onPrimary: (item: InboxItem, opts?: { retake?: boolean }) => void;
  onOpenFarmer: (farmerId: string) => void;
}

function primaryAction(item: InboxItem): { label: string; Icon: typeof Camera; retake?: boolean } {
  if (item.kind === "review") {
    if (item.evidence?.quality === "blurry") return { label: "다시 받기 요청", Icon: RefreshCw, retake: true };
    return { label: "사진 보기", Icon: Camera };
  }
  if (item.kind === "nudge") return { label: "문자로 알려주기", Icon: Send };
  return { label: "도우미 연결", Icon: HeartHandshake };
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "review", label: "사진 확인" },
  { key: "nudge", label: "알려줄 일" },
  { key: "helper", label: "도움 연결" },
];

export default function ProcessingInbox({ items, onPrimary, onOpenFarmer }: ProcessingInboxProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, review: 0, nudge: 0, helper: 0 };
    items.forEach((i) => { c[i.kind] += 1; });
    return c;
  }, [items]);
  const list = filter === "all" ? items : items.filter((i) => i.kind === filter);

  return (
    <section className="min-w-0 flex-1">
      <h1 className="text-[26px] font-extrabold tracking-tight text-[color:var(--lvb-ink)]">
        오늘 처리할 일이 <span className="text-[color:var(--lvb-accent)]">{items.length}건</span> 있어요
      </h1>
      <p className="mt-1 text-[15px] font-semibold text-[color:var(--lvb-muted)]">마감 지난 일부터 위에 모아 보여드려요. 위에서부터 처리하시면 돼요.</p>

      {/* 필터 칩 */}
      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-[15px] font-extrabold ${on ? "bg-[var(--lvb-accent)] text-white" : "border border-[var(--lvb-line-2)] bg-white text-[color:var(--lvb-ink-soft)]"}`}>
              {f.label}
              <span className={`rounded-full px-1.5 text-[13px] ${on ? "bg-white/25" : "bg-[var(--lvb-bg-soft)] text-[color:var(--lvb-muted)]"}`}>{counts[f.key]}</span>
            </button>
          );
        })}
      </div>

      {/* 처리함 목록 */}
      <ul className="mt-4 flex flex-col gap-3">
        {list.length === 0 ? (
          <li className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--lvb-line)] bg-white py-12 text-center">
            <span className="text-3xl">✅</span>
            <p className="text-[17px] font-extrabold text-[color:var(--lvb-ink)]">처리할 일이 없어요</p>
            <p className="text-[14px] font-semibold text-[color:var(--lvb-muted)]">모두 확인하셨어요. 잘하셨어요!</p>
          </li>
        ) : list.map((item) => {
          const pa = primaryAction(item);
          const urg = URGENCY_LABEL[item.urgency];
          const km = KIND_META[item.kind];
          const blurry = item.evidence?.quality === "blurry";
          return (
            <li key={item.id} className="rounded-2xl border border-[var(--lvb-line)] bg-white p-4 shadow-[0_1px_2px_rgba(31,42,31,0.04)]">
              <div className="flex items-center gap-4">
                {/* 종류 아이콘 */}
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${blurry || item.urgency === "over" ? "bg-[var(--lvb-warn-soft)]" : "bg-[var(--lvb-accent-soft)]"}`}>
                  <km.Icon size={22} className={blurry || item.urgency === "over" ? "text-[color:var(--lvb-warn)]" : "text-[color:var(--lvb-accent)]"} />
                </div>
                {/* 본문 */}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-[16px] font-extrabold text-[color:var(--lvb-ink)]">{item.farmer.name}</span>
                    <span className="text-[14px] font-semibold text-[color:var(--lvb-muted)]">{item.farmer.age}세</span>
                    {item.projTag && <Tag tone="neutral">{item.projTag.label}</Tag>}
                    <Tag tone={urg.tone === "danger" ? "danger" : urg.tone === "warn" ? "warn" : "neutral"}>{urg.label}</Tag>
                  </div>
                  <p className="text-[16px] font-extrabold leading-snug text-[color:var(--lvb-ink)] [word-break:keep-all]">{item.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[14px] font-semibold text-[color:var(--lvb-muted)]">
                    {item.dueText && <span className={item.urgency === "over" ? "text-[color:var(--lvb-danger)]" : ""}>⏰ {item.dueText}</span>}
                    {item.sub && <span>{item.sub}</span>}
                  </div>
                </div>
                {/* 행동 */}
                <div className="flex shrink-0 items-center gap-2">
                  <Btn variant="primary" size="md" Icon={pa.Icon} onClick={() => onPrimary(item, pa.retake ? { retake: true } : undefined)}>{pa.label}</Btn>
                  <button onClick={() => onOpenFarmer(item.farmer.id)} className="inline-flex min-h-[46px] items-center gap-1 rounded-xl border border-[var(--lvb-line-2)] bg-white px-3.5 text-[15px] font-extrabold text-[color:var(--lvb-ink)]">
                    농가 보기 <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* Claude Code: items = getRecentEvidence(review) + getLaggardFarmers(nudge)
   + listFarmHelpers(helper) 를 합쳐 urgency 정렬한 뷰모델.
   onPrimary 로 ReviewModal / NudgeModal / HelperModal 오픈(흐린 사진은 retake:true). */
