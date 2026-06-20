"use client";

/**
 * VillagePulse — 우측 사이드의 마을 진행률 카드 (lvb-pulse).
 *
 * 농가 N곳 현황 + 사업별 진행률 막대 + 정상/지켜보는중/확인필요 trio.
 * 처리함이 주인공 — 이 위젯은 보조.
 */

import { ChevronRight, Leaf } from "lucide-react";

export interface ProjectProgress { name: string; pct: number; }
export interface VillagePulseData {
  totalFarmers: number;
  onTrack: number;
  watch: number;
  behind: number;
  projects: ProjectProgress[];
}

const PROJ_TONES = ["green", "blue", "plum", "clay", "amber"] as const;

export default function VillagePulse({
  pulse,
  onSeeVillage,
}: {
  pulse: VillagePulseData;
  onSeeVillage: () => void;
}) {
  return (
    <div className="lvb-pulse">
      <div className="lvb-sec-head">
        <div className="lvb-sec-head-l">
          <span className="lvb-sec-ic t-green"><Leaf size={18} /></span>
          <span className="lvb-sec-title">마을 진행률</span>
        </div>
        <button type="button" className="lvb-link" onClick={onSeeVillage}>
          마을 전체 <ChevronRight size={14} />
        </button>
      </div>

      <p className="lvb-pulse-unit">농가 {pulse.totalFarmers}곳 현황</p>

      <div className="lvb-pulse-projs">
        {pulse.projects.map((p, idx) => {
          const tone = PROJ_TONES[idx % PROJ_TONES.length];
          return (
            <button key={p.name} type="button" className="lvb-pulse-proj" onClick={onSeeVillage}>
              <div className="lvb-pulse-proj-head">
                <span className={`lvb-projtag t-${tone}`}>{p.name}</span>
                <strong>{p.pct}%</strong>
              </div>
              <div className="lvb-progress" style={{ height: 8 }} role="progressbar"
                aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.name} 진행률`}>
                <span style={{
                  width: `${p.pct}%`,
                  background:
                    tone === "green" ? "var(--lvb-accent)" :
                    tone === "blue" ? "var(--lvb-blue)" :
                    tone === "plum" ? "var(--lvb-plum)" :
                    tone === "clay" ? "var(--lvb-clay)" :
                    "#a07c1e",
                }} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="lvb-pulse-trio">
        <button type="button" className="lvb-pulse-stat" onClick={onSeeVillage}>
          <span className="lvb-dot t-good" />
          <b>{pulse.onTrack}</b>
          <span>정상</span>
        </button>
        <button type="button" className="lvb-pulse-stat" onClick={onSeeVillage}>
          <span className="lvb-dot t-mid" />
          <b>{pulse.watch}</b>
          <span>지켜보는 중</span>
        </button>
        <button type="button" className="lvb-pulse-stat" onClick={onSeeVillage}>
          <span className="lvb-dot t-behind" />
          <b>{pulse.behind}</b>
          <span>확인 필요</span>
        </button>
      </div>
    </div>
  );
}
