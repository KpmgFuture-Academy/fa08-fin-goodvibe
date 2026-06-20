"use client";

/** SaveCompleteScreen — 저장/전송 완료 전체 화면(음성·직접·사진 공용). */

import { CheckCircle2, Mic, PenLine, Camera } from "lucide-react";

interface SaveCompleteScreenProps {
  method?: "voice" | "manual" | "photo";
  todayYmd: string;
  /** 저장된 요약(없으면 데모 기본값). */
  job?: string;
  parcelLabel?: string;
  navigate: (screen: string) => void;
}

const METHOD = {
  voice:  { label: "말로 남김", Icon: Mic,     msg: "말씀하신 내용을 이장님께 보냈어요.", bg: "#dbeafe", color: "#1d4ed8" },
  manual: { label: "직접 적음", Icon: PenLine, msg: "적으신 내용을 이장님께 보냈어요.",   bg: "#d1fae5", color: "#047857" },
  photo:  { label: "사진",      Icon: Camera,  msg: "사진을 이장님께 보냈어요.",          bg: "#ede9fe", color: "#6d28d9" },
} as const;

export default function SaveCompleteScreen({ method = "voice", todayYmd, job = "", parcelLabel = "", navigate }: SaveCompleteScreenProps) {
  const m = METHOD[method];
  const MIcon = m.Icon;
  return (
    <div className="flex min-h-full flex-col bg-white px-4 pb-8">
      <div className="flex flex-col items-center pb-6 pt-12">
        <div className="mb-4 rounded-full bg-[var(--lv-accent-soft)] p-5"><CheckCircle2 size={56} className="text-[color:var(--lv-primary)]" /></div>
        <h1 className="text-center text-[28px] font-extrabold text-[color:var(--lv-ink)]">이장님께 보냈어요</h1>
        <p className="mt-2 text-center text-[17px] leading-snug text-[color:var(--lv-muted)]">{m.msg}</p>
      </div>

      <div className="rounded-2xl border border-[var(--lv-line-soft)] bg-white p-4 shadow-[0_1px_2px_rgba(31,42,31,0.04),0_6px_14px_rgba(31,42,31,0.04)]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[16px] font-extrabold text-[color:var(--lv-ink)]">저장한 내용</h3>
          <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold" style={{ background: m.bg, color: m.color }}><MIcon size={14} />{m.label}</span>
        </div>
        <div className="flex flex-col gap-2.5">
          <p className="text-[14px] text-[color:var(--lv-muted)]">날짜: <span className="font-bold text-[color:var(--lv-ink)]">{todayYmd}</span></p>
          {job && <p className="text-[14px] text-[color:var(--lv-muted)]">작업: <span className="font-bold text-[color:var(--lv-ink)]">{job}</span></p>}
          {parcelLabel && <p className="text-[14px] text-[color:var(--lv-muted)]">위치: <span className="font-bold text-[color:var(--lv-ink)]">{parcelLabel}</span></p>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button onClick={() => navigate("home")} className="min-h-[64px] rounded-2xl bg-[var(--lv-primary)] text-[19px] font-extrabold text-white">홈으로</button>
        <button onClick={() => navigate("journal")} className="min-h-[64px] rounded-2xl border border-[var(--lv-line)] bg-white text-[19px] font-extrabold text-[color:var(--lv-ink)]">일지 보기</button>
      </div>
    </div>
  );
}
