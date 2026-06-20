"use client";

/** 도우미 모드 진입/복귀 인터스티셜 — Adaptive Field Interface 로딩(크림 배경 + 흰 카드).
 *
 *  - direction="enter" : 기록 도움 준비 (recipientName 화면으로 이동)
 *  - direction="leave" : 내 기록으로 복귀
 *
 *  LocavilleApp 이 2.5초 setTimeout 으로 자동 숨김. (호출 계약 불변)
 *  접근성: 제목 22px bold, 본문 16px, 대비 AA. 모션은 점 3개 펄스만(reduced-motion 시 정지).
 */

import { Users, Home } from "lucide-react";

export function HelperModeTransitionScreen({
  direction = "enter",
  recipientName,
}: {
  direction?: "enter" | "leave";
  recipientName?: string;
}) {
  const isEnter = direction === "enter";
  const title = isEnter ? "기록 도움을 준비하고 있어요" : "내 기록으로 돌아가고 있어요";
  const subtitle = isEnter
    ? recipientName
      ? `${recipientName}님 기록 화면으로 이동합니다`
      : "동의된 기록만 함께 작성할 수 있어요"
    : "도움 주셔서 감사합니다";

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-[var(--lv-bg)] px-6">
      <div className="flex w-full max-w-[340px] flex-col items-center gap-3 rounded-[28px] bg-[var(--lv-card)] px-6 py-9 text-center shadow-[0_8px_28px_rgba(23,35,27,0.06)]">
        <span className="flex h-[60px] w-[60px] items-center justify-center rounded-2xl bg-[var(--lv-accent-soft)]">
          {isEnter
            ? <Users size={28} strokeWidth={2} className="text-[color:var(--lv-primary)]" />
            : <Home size={28} strokeWidth={2} className="text-[color:var(--lv-primary)]" />}
        </span>
        <h2 className="m-0 mt-1 text-[22px] font-bold leading-snug tracking-tight text-[color:var(--lv-ink)] [word-break:keep-all]">{title}</h2>
        <p className="m-0 text-[16px] font-medium leading-[1.5] text-[color:var(--lv-ink-soft)] [word-break:keep-all]">{subtitle}</p>
        <div className="mt-2 flex gap-2" aria-hidden>
          <span className="lv-helper-dot" />
          <span className="lv-helper-dot lv-helper-dot-2" />
          <span className="lv-helper-dot lv-helper-dot-3" />
        </div>
      </div>

      <style>{`
        .lv-helper-dot { width:8px; height:8px; border-radius:50%; background:var(--lv-primary); animation:lv-helper-dot 1.2s ease-in-out infinite; }
        .lv-helper-dot-2 { animation-delay:0.18s; }
        .lv-helper-dot-3 { animation-delay:0.36s; }
        @keyframes lv-helper-dot { 0%,80%,100%{opacity:0.25;transform:translateY(0);} 40%{opacity:1;transform:translateY(-4px);} }
        @media (prefers-reduced-motion: reduce) { .lv-helper-dot { animation: none !important; opacity: 0.6; } }
      `}</style>
    </div>
  );
}
