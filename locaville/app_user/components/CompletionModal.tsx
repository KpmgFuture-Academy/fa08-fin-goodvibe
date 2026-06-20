"use client";

/** CompletionModal — 저장/전송 완료 바텀시트. tone="warn" 이면 주의(이장님 확인) 톤,
 *  secondary 를 주면 보조 버튼(예: 다시 찍기)이 함께 뜬다. */
import { CheckCircle2, AlertCircle } from "lucide-react";

export interface DetailLine { label: string; value: string; }

interface CompletionModalProps {
  open: boolean;
  title: string;
  tone?: "success" | "warn";
  highlightLines?: string[];
  detailLines?: DetailLine[];
  onHome: () => void;
  homeLabel?: string;
  secondary?: { label: string; onClick: () => void };
}

export default function CompletionModal({ open, title, tone = "success", highlightLines = [], detailLines = [], onHome, homeLabel = "홈으로", secondary }: CompletionModalProps) {
  if (!open) return null;
  const warn = tone === "warn";
  const Icon = warn ? AlertCircle : CheckCircle2;
  return (
    <div className="absolute inset-0 z-[90] flex items-end justify-center bg-black/45">
      <div className="w-full rounded-t-3xl bg-white px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-7 shadow-[0_-12px_36px_rgba(15,23,16,0.2)]">
        <div className="mb-[18px] flex flex-col items-center gap-1">
          <div className={`mb-1.5 rounded-full p-3.5 ${warn ? "bg-[var(--lv-warn-soft)]" : "bg-[var(--lv-accent-soft)]"}`}>
            <Icon size={40} className={warn ? "text-[color:var(--lv-warn)]" : "text-[color:var(--lv-primary)]"} />
          </div>
          <h2 className="text-center text-[22px] font-extrabold text-[color:var(--lv-ink)] [word-break:keep-all]">{title}</h2>
        </div>
        {highlightLines.length > 0 && (
          <div className={`mb-3.5 rounded-2xl p-4 text-center ${warn ? "bg-[var(--lv-warn-soft)]" : "bg-[var(--lv-accent-soft)]"}`}>
            {highlightLines.map((l, i) => (
              <p key={i} className={`leading-relaxed [word-break:keep-all] ${warn ? "text-[color:var(--lv-warn)]" : "text-[color:var(--lv-accent-dark)]"} ${i === 0 ? "text-[18px] font-extrabold" : "text-[15px] font-semibold"}`}>{l}</p>
            ))}
          </div>
        )}
        {detailLines.length > 0 && (
          <div className="mb-[18px] flex flex-col gap-2 rounded-2xl border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] p-3.5">
            {detailLines.map((d, i) => (
              <div key={i} className="flex justify-between gap-3">
                <span className="shrink-0 text-[14px] text-[color:var(--lv-muted)]">{d.label}</span>
                <span className="text-right text-[14px] font-bold text-[color:var(--lv-ink)] [word-break:keep-all]">{d.value}</span>
              </div>
            ))}
          </div>
        )}
        {secondary ? (
          <div className="flex gap-3">
            <button onClick={secondary.onClick} className="min-h-[56px] flex-1 rounded-2xl border border-[var(--lv-line)] bg-white text-[17px] font-bold text-[color:var(--lv-ink)]">{secondary.label}</button>
            <button onClick={onHome} className="min-h-[56px] flex-1 rounded-2xl bg-[var(--lv-primary)] text-[17px] font-extrabold text-white shadow-[0_6px_16px_rgba(47,109,79,0.25)]">{homeLabel}</button>
          </div>
        ) : (
          <button onClick={onHome} className="min-h-[56px] w-full rounded-2xl bg-[var(--lv-primary)] text-[17px] font-extrabold text-white shadow-[0_6px_16px_rgba(47,109,79,0.25)]">{homeLabel}</button>
        )}
      </div>
    </div>
  );
}
