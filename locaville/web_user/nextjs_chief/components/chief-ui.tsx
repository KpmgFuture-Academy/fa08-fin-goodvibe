"use client";

/**
 * 이장님 대시보드 공용 타입 + UI 프리미티브 (web_user).
 * 색/폰트는 locaville-chief-tokens.css 의 --lvb-* 변수를 따릅니다.
 */

import type { ReactNode } from "react";
import {
  Camera, Bell, HeartHandshake, ChevronRight, Check, AlertCircle, Send, RefreshCw, X,
} from "lucide-react";

// ── 도메인 타입 ──
export type FarmerState = "good" | "mid" | "behind" | "help";
export type Urgency = "over" | "today" | "week" | "soon";
export type InboxKind = "review" | "nudge" | "helper";

export interface ParcelInfo { name: string; crop: string; }
export interface Farmer {
  id: string; name: string; age: number; phone: string;
  state: FarmerState; tone: string; parcels: ParcelInfo[];
  note?: string; helpedBy?: string; helperFor?: string;
}
export interface ProjTag { label: string; tone: string; }
export interface InboxItem {
  id: string;
  kind: InboxKind;
  urgency: Urgency;
  farmer: Farmer;
  projTag?: ProjTag | null;
  title: string;
  sub?: string;
  dueText?: string | null;
  /** review 일 때 증빙 메타. */
  evidence?: { id: string; quality: "ok" | "blurry"; label: string; when: string; img: string } | null;
}

export const STATE_LABEL: Record<FarmerState, string> = {
  good: "정상", mid: "지켜보는 중", behind: "확인 필요", help: "도우미 연결",
};
export const URGENCY_LABEL: Record<Urgency, { label: string; tone: "danger" | "warn" | "neutral" }> = {
  over: { label: "마감 지남", tone: "danger" }, today: { label: "오늘 처리", tone: "warn" },
  week: { label: "이번 주", tone: "warn" }, soon: { label: "여유", tone: "neutral" },
};
export const KIND_META: Record<InboxKind, { label: string; Icon: typeof Camera }> = {
  review: { label: "사진 확인", Icon: Camera },
  nudge: { label: "알려줄 일", Icon: Bell },
  helper: { label: "도움 연결", Icon: HeartHandshake },
};

// ── 버튼 ──
export function Btn({ children, variant = "primary", size = "md", Icon, onClick, disabled, full }: {
  children?: ReactNode; variant?: "primary" | "outline" | "ghost" | "warn"; size?: "sm" | "md" | "lg";
  Icon?: typeof Camera; onClick?: () => void; disabled?: boolean; full?: boolean;
}) {
  const pad = size === "lg" ? "min-h-[52px] px-5 text-[17px]" : size === "sm" ? "min-h-[40px] px-3.5 text-[14px]" : "min-h-[46px] px-4 text-[15px]";
  const tone = {
    primary: "bg-[var(--lvb-accent)] text-white border-transparent",
    warn: "bg-[var(--lvb-warn)] text-white border-transparent",
    outline: "bg-white text-[color:var(--lvb-ink)] border-[var(--lvb-line-2)]",
    ghost: "bg-transparent text-[color:var(--lvb-ink-soft)] border-transparent",
  }[variant];
  const sz = size === "lg" ? 22 : size === "sm" ? 16 : 19;
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border font-extrabold ${pad} ${tone} ${full ? "w-full" : ""} ${disabled ? "opacity-45" : ""}`}>
      {Icon ? <Icon size={sz} /> : null}{children ? <span>{children}</span> : null}
    </button>
  );
}

// ── 태그 ──
export function Tag({ children, tone = "neutral", Icon }: { children: ReactNode; tone?: "good" | "neutral" | "warn" | "danger"; Icon?: typeof Camera }) {
  const map = {
    good: "bg-[var(--lvb-accent-soft)] text-[color:var(--lvb-accent-dark)]",
    neutral: "bg-[var(--lvb-bg-soft)] text-[color:var(--lvb-muted)]",
    warn: "bg-[var(--lvb-warn-soft)] text-[color:var(--lvb-warn-ink)]",
    danger: "bg-[var(--lvb-danger-soft)] text-[color:var(--lvb-danger)]",
  }[tone];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-extrabold ${map}`}>{Icon ? <Icon size={13} /> : null}{children}</span>;
}

// ── 진행 바 ──
export function ProgressBar({ value, total, label }: { value: number; total: number; label?: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-[var(--lvb-line)]">
      <span className="block h-full rounded-full bg-[var(--lvb-accent)]" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── 증빙 썸네일 (실제 이미지는 resolveImageUrl 로 교체) ──
export function EvThumb({ src, label, size = 64, blurry }: { src?: string; label?: string; size?: number; blurry?: boolean }) {
  if (src) return <img src={src} alt={label || "증빙 사진"} width={size} height={size} loading="lazy" className="rounded-xl object-cover" style={{ width: size, height: size }} />;
  return (
    <span role="img" aria-label={label || "증빙 사진"} style={{ width: size, height: size }}
      className={`flex items-center justify-center rounded-xl text-[12px] font-bold ${blurry ? "bg-[var(--lvb-warn-soft)] text-[color:var(--lvb-warn-ink)]" : "bg-[var(--lvb-bg-soft)] text-[color:var(--lvb-muted)]"}`}>
      {blurry ? "흐림" : "현장"}
    </span>
  );
}

export { Camera, Bell, HeartHandshake, ChevronRight, Check, AlertCircle, Send, RefreshCw, X };
