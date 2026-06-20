"use client";

/**
 * VillageScreen — 마을 명단(농가별 / 단체별 보기) + 검색·정렬.
 */

import { useMemo, useState } from "react";
import { Users, Layers, UserPlus, Search, MapPin, ChevronRight, Send } from "lucide-react";
import { Btn, Tag, ProgressBar, STATE_LABEL, type Farmer } from "./chief-ui";

export interface RosterFarmer extends Farmer {
  projTags: { label: string; tone: string }[];
  done: number; total: number;
}
export interface GroupCard {
  id: string; name: string; leaderName: string;
  tag: { label: string; tone: string }; biz: string;
  members: { id: string; name: string; isLeader: boolean; optedOut: boolean }[];
  participants: number;
}

const tone = (s: Farmer["state"]) => (s === "good" ? "good" : s === "mid" ? "neutral" : s === "behind" ? "warn" : "danger") as const;
const RANK: Record<Farmer["state"], number> = { help: 0, behind: 1, mid: 2, good: 3 };

export default function VillageScreen({
  villageName, farmerCount, groupCount, roster, groups, onOpenFarmer, onOpenGroup, onNudge, onAddResident,
}: {
  villageName: string; farmerCount: number; groupCount: number;
  roster: RosterFarmer[]; groups: GroupCard[];
  onOpenFarmer: (id: string) => void; onOpenGroup: (id: string) => void;
  onNudge: (id: string) => void; onAddResident: () => void;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"behind" | "name">("behind");
  const [view, setView] = useState<"farmer" | "group">("farmer");

  const list = useMemo(() => {
    const arr = roster.filter((f) => f.name.includes(q.trim()));
    return sort === "behind" ? [...arr].sort((a, b) => RANK[a.state] - RANK[b.state]) : [...arr].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [roster, q, sort]);

  const seg = (on: boolean) => `inline-flex min-h-[40px] items-center gap-1.5 px-3.5 text-[14px] font-extrabold ${on ? "bg-[var(--lvb-accent)] text-white" : "text-[color:var(--lvb-ink-soft)]"}`;

  return (
    <div className="lvb-root bg-[var(--lvb-bg)] p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-[24px] font-extrabold text-[color:var(--lvb-ink)]">마을 농가</h1><p className="text-[15px] font-semibold text-[color:var(--lvb-muted)]">{villageName} · 농가 {farmerCount}곳 · 단체 {groupCount}곳</p></div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-full border border-[var(--lvb-line-2)] bg-white">
            <button className={seg(view === "farmer")} onClick={() => setView("farmer")}><Users size={16} />농가별</button>
            <button className={seg(view === "group")} onClick={() => setView("group")}><Layers size={16} />단체별</button>
          </div>
          <Btn variant="primary" size="md" Icon={UserPlus} onClick={onAddResident}>주민 추가</Btn>
        </div>
      </div>

      {view === "group" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <section key={g.id} className="rounded-2xl border border-[var(--lvb-line)] bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--lvb-accent-soft)]"><Layers size={20} className="text-[color:var(--lvb-accent)]" /></span>
                  <div>
                    <div className="text-[16px] font-extrabold text-[color:var(--lvb-ink)]">{g.name}</div>
                    <div className="text-[13px] font-semibold text-[color:var(--lvb-muted)]">대표 {g.leaderName} · 참여 {g.participants} / {g.members.length}명</div>
                  </div>
                </div>
                <button onClick={() => onOpenGroup(g.id)} className="inline-flex items-center gap-1.5"><Tag tone="neutral">{g.tag.label}</Tag><ChevronRight size={16} className="text-[color:var(--lvb-muted)]" /></button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.members.map((m) => (
                  <button key={m.id} onClick={() => onOpenFarmer(m.id)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[14px] font-bold ${m.optedOut ? "bg-[var(--lvb-bg-soft)] text-[color:var(--lvb-muted)] line-through" : "bg-[var(--lvb-accent-soft)] text-[color:var(--lvb-accent-dark)]"}`}>
                    {m.name}{m.isLeader && <span className="rounded-full bg-white/60 px-1 text-[11px]">대표</span>}{m.optedOut && <span className="text-[11px]">참여×</span>}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex min-w-[220px] flex-1 items-center gap-2 rounded-full border border-[var(--lvb-line-2)] bg-white px-4">
              <Search size={17} className="text-[color:var(--lvb-muted)]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="농가 이름" className="min-h-[44px] w-full bg-transparent text-[15px] font-semibold text-[color:var(--lvb-ink)] outline-none" />
            </div>
            <div className="flex overflow-hidden rounded-full border border-[var(--lvb-line-2)] bg-white">
              <button className={seg(sort === "behind")} onClick={() => setSort("behind")}>챙길 순</button>
              <button className={seg(sort === "name")} onClick={() => setSort("name")}>이름순</button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((f) => {
              const care = f.state === "behind" || f.state === "help";
              return (
                <div key={f.id} className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 ${care ? "border-[var(--lvb-warn)]" : "border-[var(--lvb-line)]"}`}>
                  <button onClick={() => onOpenFarmer(f.id)} className="flex items-center gap-3 text-left">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--lvb-accent-soft)] text-[18px] font-extrabold text-[color:var(--lvb-accent-dark)]">{f.name[0]}</div>
                    <div><div className="text-[16px] font-extrabold text-[color:var(--lvb-ink)]">{f.name} <span className="text-[13px] font-semibold text-[color:var(--lvb-muted)]">{f.age}세</span></div><Tag tone={tone(f.state)}>{STATE_LABEL[f.state]}</Tag></div>
                  </button>
                  <div className="flex flex-wrap gap-1.5">{f.projTags.map((t, i) => <Tag key={i} tone="neutral">{t.label}</Tag>)}</div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[13px] font-bold text-[color:var(--lvb-muted)]"><span>참여 사업 진척</span><strong className="text-[color:var(--lvb-ink)]">{f.done}/{f.total}</strong></div>
                    <ProgressBar value={f.done} total={f.total} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[13px] font-bold text-[color:var(--lvb-muted)]"><MapPin size={13} />{f.parcels.map((p) => p.crop).join("·")}</span>
                    {care ? <Btn variant="outline" size="sm" Icon={Send} onClick={() => onNudge(f.id)}>문자</Btn>
                      : <button onClick={() => onOpenFarmer(f.id)} className="inline-flex items-center gap-0.5 text-[14px] font-extrabold text-[color:var(--lvb-accent)]">보기 <ChevronRight size={13} /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* Claude Code: roster/groups = 마을 농가·단체 응답. onNudge → NudgeModal. */
