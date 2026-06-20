"use client";

/**
 * VillagePulse — 처리함 우측 보조 패널: 마을 진행률 + 오늘 마을 메모.
 * 통계가 주인공이 아님(처리함이 중심). 한눈에 마을 상태만.
 */

import { Leaf, ChevronRight, Volume2 } from "lucide-react";
import { ProgressBar } from "./chief-ui";

export interface ProjectProgress { name: string; pct: number; }
export interface VillagePulseData {
  totalFarmers: number;
  onTrack: number;   // 정상
  watch: number;     // 지켜보는 중
  behind: number;    // 확인 필요(+도우미 연결)
  projects: ProjectProgress[];
}

export default function VillagePulse({ pulse, memo, onSeeVillage, onPlayMemo }: {
  pulse: VillagePulseData;
  memo: string;
  onSeeVillage: () => void;
  onPlayMemo?: () => void;
}) {
  return (
    <aside className="flex w-[332px] shrink-0 flex-col gap-4">
      {/* 오늘 마을 메모 */}
      <div className="rounded-2xl border border-[var(--lvb-line)] bg-[var(--lvb-accent-soft)] p-[18px]">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌤️</span>
            <h2 className="text-[16px] font-extrabold text-[color:var(--lvb-accent-dark)]">오늘 마을 메모</h2>
          </div>
          {onPlayMemo && (
            <button onClick={onPlayMemo} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[13px] font-extrabold text-[color:var(--lvb-accent-dark)]"><Volume2 size={14} />들어보기</button>
          )}
        </div>
        <p className="text-[15px] font-semibold leading-relaxed text-[color:var(--lvb-accent-dark)] [word-break:keep-all]">{memo}</p>
      </div>

      {/* 마을 진행률 */}
      <div className="rounded-2xl border border-[var(--lvb-line)] bg-white p-[18px]">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2"><Leaf size={18} className="text-[color:var(--lvb-accent)]" /><h2 className="text-[16px] font-extrabold text-[color:var(--lvb-ink)]">마을 진행률</h2></div>
          <button onClick={onSeeVillage} className="inline-flex items-center gap-0.5 text-[14px] font-extrabold text-[color:var(--lvb-accent)]">마을 전체 <ChevronRight size={14} /></button>
        </div>
        <p className="mb-3 text-[13px] font-bold text-[color:var(--lvb-muted)]">농가 {pulse.totalFarmers}곳 현황</p>

        <div className="flex flex-col gap-2.5">
          {pulse.projects.map((p) => (
            <div key={p.name}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[14px] font-bold text-[color:var(--lvb-ink)]">{p.name}</span>
                <span className="text-[14px] font-extrabold text-[color:var(--lvb-ink)]">{p.pct}%</span>
              </div>
              <ProgressBar value={p.pct} total={100} label={`${p.name} 진행률`} />
            </div>
          ))}
        </div>

        {/* 상태별 농가 수 — 색 + 라벨 동반 */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {([["good", pulse.onTrack, "정상", "var(--lvb-accent)"], ["mid", pulse.watch, "지켜보는 중", "var(--lvb-muted)"], ["behind", pulse.behind, "확인 필요", "var(--lvb-clay)"]] as const).map(([k, n, label, color]) => (
            <button key={k} onClick={onSeeVillage} className="flex flex-col items-center gap-1 rounded-xl border border-[var(--lvb-line)] bg-[var(--lvb-bg-soft)] py-3">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              <b className="text-[20px] font-extrabold text-[color:var(--lvb-ink)]">{n}</b>
              <span className="text-[12.5px] font-bold text-[color:var(--lvb-muted)]">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

/* Claude Code: pulse = getAdminTodoStatus + 농가 state 집계.
   memo = 오늘의 운영 메모(AI 또는 정적). onPlayMemo = fetchTtsAudio. */
