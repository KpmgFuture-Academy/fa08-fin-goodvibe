"use client";

/**
 * ModeChooser — 첫 진입 시 화면 모드 선택(쉬운/표준).
 * 추상 막대가 아닌 실제 레이아웃 축소판 미리보기로 차이를 보여줍니다.
 * 기본 추천 = 쉬운 화면(위·"추천" 배지). 강제하지 않고 직접 고르게 함.
 */

import { ChevronRight, Droplets } from "lucide-react";

interface ModeChooserProps {
  onPick: (mode: "easy" | "standard") => void;
}

export default function ModeChooser({ onPick }: ModeChooserProps) {
  return (
    <div className="flex min-h-full flex-col justify-center gap-3 bg-[var(--lv-bg)] px-[18px] py-3.5">
      <div className="mb-0.5">
        <p className="text-[24px] font-extrabold leading-tight tracking-tight text-[color:var(--lv-ink)]">어떤 화면이 더 편하세요?</p>
        <p className="mt-1.5 text-[15px] font-semibold leading-snug text-[color:var(--lv-ink-soft)]">고른 화면을 미리 보여드려요.</p>
      </div>

      <ModeCard recommended title="쉬운 화면" sub="글씨가 크고, 한 번에 하나씩 기록해요 · 처음 쓰시는 분께 추천"
        onClick={() => onPick("easy")} preview={<PreviewEasy />} />
      <ModeCard title="표준 화면" sub="할 일을 한눈에 보고 빠르게 기록해요 · 스마트폰이 익숙한 분께 좋아요"
        onClick={() => onPick("standard")} preview={<PreviewStandard />} />

      <p className="mt-1 text-center text-[14px] font-semibold leading-snug text-[color:var(--lv-muted)] [word-break:keep-all]">
        처음에는 쉬운 화면으로 시작해요. 언제든 설정에서 표준 화면으로 바꿀 수 있어요.
      </p>
    </div>
  );
}

function ModeCard({ recommended, title, sub, onClick, preview }: {
  recommended?: boolean; title: string; sub: string; onClick: () => void; preview: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`flex w-full flex-col gap-2.5 rounded-[20px] border-2 bg-[var(--lv-card)] p-3.5 text-left ${recommended ? "border-[var(--lv-primary)] shadow-[0_12px_26px_rgba(47,109,79,0.12)]" : "border-[var(--lv-line)] shadow-[0_6px_16px_rgba(31,42,31,0.06)]"}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[21px] font-extrabold leading-tight text-[color:var(--lv-ink)]">{title}</p>
            {recommended && <span className="rounded-full bg-[var(--lv-accent-soft)] px-2.5 py-0.5 text-[12px] font-extrabold text-[color:var(--lv-primary)]">추천</span>}
          </div>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug text-[color:var(--lv-ink-soft)] [word-break:keep-all]">{sub}</p>
        </div>
        <ChevronRight size={24} className="text-[color:var(--lv-ink-soft)]" />
      </div>
      {preview}
    </button>
  );
}

// 쉬운 화면 미리보기: 큰 카드 하나 + 큰 버튼
function PreviewEasy() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] p-2.5">
      <div className="flex flex-col gap-1.5 rounded-[9px] border-[1.5px] border-[var(--lv-primary)] bg-white p-2.5">
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-[var(--lv-accent-soft)]"><Droplets size={14} className="text-[color:var(--lv-primary)]" /></div>
        <div className="h-[9px] w-4/5 rounded bg-[var(--lv-ink)]" />
        <div className="h-1.5 w-[55%] rounded-full bg-[var(--lv-warn)]" />
      </div>
      <div className="flex h-[26px] items-center justify-center rounded-lg bg-[var(--lv-primary)]">
        <div className="h-[7px] w-[46%] rounded-full bg-white/90" />
      </div>
    </div>
  );
}

// 표준 화면 미리보기: 헤더 + 할 일 3줄 + 빠른 3버튼
function PreviewStandard() {
  const Row = () => (
    <div className="flex items-center gap-1.5">
      <div className="flex h-4 w-4 items-center justify-center rounded-[5px] bg-[var(--lv-accent-soft)]"><Droplets size={9} className="text-[color:var(--lv-primary)]" /></div>
      <div className="flex flex-1 flex-col gap-[3px]">
        <div className="h-[5px] w-[70%] rounded-full bg-[var(--lv-ink-soft)]" />
        <div className="h-1 w-[40%] rounded-full bg-[var(--lv-warn)]" />
      </div>
      <div className="h-[13px] w-[26px] rounded bg-[var(--lv-primary)]" />
    </div>
  );
  return (
    <div className="flex flex-col gap-[7px] rounded-xl border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] p-2.5">
      <div className="flex items-center justify-between">
        <div className="h-1.5 w-[54px] rounded-full bg-[var(--lv-ink)]" />
        <div className="h-1.5 w-[30px] rounded-full bg-[var(--lv-primary)]" />
      </div>
      <Row /><Row /><Row />
      <div className="mt-px flex gap-1.5">
        <div className="h-[18px] flex-1 rounded-[5px] bg-[var(--lv-primary)]" />
        <div className="h-[18px] flex-1 rounded-[5px] bg-[var(--lv-accent-soft)]" />
        <div className="h-[18px] flex-1 rounded-[5px] bg-[var(--lv-accent-soft)]" />
      </div>
    </div>
  );
}

/* Claude Code: onPick 으로 받은 모드를 preferences(setSimpleMode 등)에 저장하고
   home 으로 navigate. 첫 진입 1회만 노출(이미 고른 사용자는 스킵). */
