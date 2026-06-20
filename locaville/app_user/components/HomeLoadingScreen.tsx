"use client";

/**
 * HomeLoadingScreen — 홈 첫 진입 로딩 (Adaptive Field Interface 톤).
 * 셸이 data 로딩 동안 표시하고 준비되면 언마운트(고정 타이머 아님, 최대 2.5초 cap).
 * 크림 배경 + 흰 카드 + 선형 아이콘 — 홈과 같은 디자인 시스템. 일러스트/주황 배경 금지.
 */

import { Sun } from "lucide-react";

export function HomeLoadingScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--lv-bg)] px-6">
      <div className="flex w-full max-w-[340px] flex-col items-center gap-3 rounded-[28px] bg-[var(--lv-card)] px-6 py-9 text-center shadow-[0_8px_28px_rgba(23,35,27,0.06)]">
        <span className="flex h-[60px] w-[60px] items-center justify-center rounded-2xl bg-[var(--lv-accent-soft)]">
          <Sun size={28} strokeWidth={2} className="text-[color:var(--lv-primary)]" />
        </span>
        <h1 className="m-0 mt-1 text-[22px] font-bold leading-snug tracking-tight text-[color:var(--lv-ink)] [word-break:keep-all]">오늘 할 일을 불러오고 있어요</h1>
        <p className="m-0 text-[16px] font-medium leading-[1.5] text-[color:var(--lv-ink-soft)]">잠시만 기다려 주세요</p>
        <div className="mt-2 flex gap-2" aria-hidden>
          <span className="lv-home-dot" />
          <span className="lv-home-dot lv-home-dot-2" />
          <span className="lv-home-dot lv-home-dot-3" />
        </div>
      </div>

      <style>{`
        .lv-home-dot { width:8px; height:8px; border-radius:50%; background:var(--lv-primary); animation:lv-home-dot 1.2s ease-in-out infinite; }
        .lv-home-dot-2 { animation-delay:0.18s; }
        .lv-home-dot-3 { animation-delay:0.36s; }
        @keyframes lv-home-dot { 0%,80%,100%{opacity:0.25;transform:translateY(0);} 40%{opacity:1;transform:translateY(-4px);} }
        @media (prefers-reduced-motion: reduce) { .lv-home-dot { animation: none !important; opacity: 0.6; } }
      `}</style>
    </div>
  );
}

/* Claude Code: 셸(LocavilleApp)이 data 로딩 동안만 마운트하고 준비되면 제거합니다. */
