"use client";

/**
 * VillageScreen — 마을 명단(농가별 / 단체별 보기) + 검색·정렬.
 * 원본 chief 디자인(lvb-page-head, lvb-roster, lvb-rcard, lvb-groups, lvb-gcard).
 */

import { useMemo, useState } from "react";
import {
  ChevronRight,
  Layers,
  MapPin,
  Search,
  Send,
  UserPlus,
  Users,
} from "lucide-react";
import { STATE_LABEL, type Farmer } from "./chief-ui";

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

const TAG_TONE: Record<Farmer["state"], "good" | "neutral" | "warn" | "danger"> = {
  good: "good",
  mid: "neutral",
  behind: "warn",
  help: "danger",
};
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
    return sort === "behind"
      ? [...arr].sort((a, b) => RANK[a.state] - RANK[b.state])
      : [...arr].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [roster, q, sort]);

  return (
    <div className="lvb-screen-pad">
      <div className="lvb-page-head">
        <div>
          <h1>마을 농가</h1>
          <p>{villageName} · 농가 {farmerCount}곳 · 단체 {groupCount}곳</p>
        </div>
        <div className="lvb-page-head-tools">
          <div className="lvb-seg lvb-seg-view" role="group" aria-label="보기 방식">
            <button
              type="button"
              className={view === "farmer" ? "is-on" : ""}
              aria-pressed={view === "farmer"}
              onClick={() => setView("farmer")}
            >
              <Users size={16} />농가별
            </button>
            <button
              type="button"
              className={view === "group" ? "is-on" : ""}
              aria-pressed={view === "group"}
              onClick={() => setView("group")}
            >
              <Layers size={16} />단체별
            </button>
          </div>
          <button
            type="button"
            className="lvb-btn lvb-btn-primary lvb-btn-md"
            onClick={onAddResident}
          >
            <UserPlus size={19} />
            <span>주민 추가</span>
          </button>
        </div>
      </div>

      {view === "group" ? (
        <div className="lvb-groups">
          {groups.map((g) => {
            const toneClass = g.tag.tone === "blue" ? "t-blue" : g.tag.tone === "plum" ? "t-plum" : "t-green";
            return (
              <section key={g.id} className={`lvb-gcard ${toneClass}`}>
                <div className="lvb-gcard-head">
                  <div className="lvb-gcard-id">
                    <span className={`lvb-gcard-ic ${toneClass}`}><Layers size={20} /></span>
                    <div>
                      <div className="lvb-gcard-name">{g.name}</div>
                      <div className="lvb-gcard-sub">
                        대표 {g.leaderName || "—"} · 참여 {g.participants} / {g.members.length}명
                      </div>
                    </div>
                  </div>
                  <button type="button" className="lvb-gcard-proj" onClick={() => onOpenGroup(g.id)}>
                    <span className={`lvb-projtag ${toneClass}`}>{g.tag.label}</span>
                    {g.biz && <span className="lvb-gcard-proj-biz">{g.biz}</span>}
                    <ChevronRight size={16} />
                  </button>
                </div>
                {g.members.length > 0 && (
                  <div className="lvb-gcard-members">
                    {g.members.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`lvb-gchip${m.optedOut ? " is-out" : ""}`}
                        onClick={() => onOpenFarmer(m.id)}
                      >
                        {m.name}
                        {m.isLeader && <span className="lvb-gchip-lead">대표</span>}
                        {m.optedOut && <span className="lvb-gchip-out">참여×</span>}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <div className="lvb-roster-tools">
            <div className="lvb-search">
              <Search size={17} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="농가 이름"
                aria-label="농가 이름 검색"
              />
            </div>
            <div className="lvb-seg" role="group" aria-label="정렬 기준">
              <button
                type="button"
                className={sort === "behind" ? "is-on" : ""}
                aria-pressed={sort === "behind"}
                onClick={() => setSort("behind")}
              >
                챙길 순
              </button>
              <button
                type="button"
                className={sort === "name" ? "is-on" : ""}
                aria-pressed={sort === "name"}
                onClick={() => setSort("name")}
              >
                이름순
              </button>
            </div>
          </div>

          <div className="lvb-roster">
            {list.map((f) => {
              const needsCare = f.state === "behind" || f.state === "help";
              return (
                <div key={f.id} className={`lvb-rcard${needsCare ? " needs" : ""}`}>
                  <button
                    type="button"
                    className="lvb-rcard-top"
                    onClick={() => onOpenFarmer(f.id)}
                  >
                    <div className="lvb-rcard-id">
                      <div className="lvb-rcard-name">{f.name}</div>
                      <span className={`lvb-tag lvb-tag-${TAG_TONE[f.state]}`}>
                        {STATE_LABEL[f.state]}
                      </span>
                    </div>
                  </button>
                  <div className="lvb-rcard-projs">
                    {f.projTags.map((t, i) => (
                      <span key={i} className="lvb-projtag t-green">{t.label}</span>
                    ))}
                  </div>
                  <div>
                    <div className="lvb-rcard-prog-head">
                      <span>참여 사업 진척</span>
                      <strong>{f.done}/{f.total}</strong>
                    </div>
                    <div className="lvb-progress" style={{ height: 8 }} role="progressbar"
                      aria-valuenow={f.total ? Math.round((f.done / f.total) * 100) : 0}
                      aria-valuemin={0} aria-valuemax={100}>
                      <span style={{
                        width: f.total ? `${(f.done / f.total) * 100}%` : "0%",
                        background: needsCare ? "var(--lvb-clay)" : "var(--lvb-accent)",
                      }} />
                    </div>
                  </div>
                  {f.address && (
                    <div
                      className="lvb-rcard-addr"
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--lvb-muted)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        wordBreak: "keep-all",
                      }}
                    >
                      <MapPin size={13} />
                      {f.address}
                    </div>
                  )}
                  <div className="lvb-rcard-foot">
                    <span className="lvb-rcard-parcel">
                      {f.parcels.length > 0
                        ? Array.from(
                            new Set(f.parcels.map((p) => p.crop).filter(Boolean))
                          ).join("·") || "작물 미등록"
                        : "필지 미등록"}
                    </span>
                    {needsCare ? (
                      <button
                        type="button"
                        className="lvb-btn lvb-btn-outline lvb-btn-sm"
                        onClick={() => onNudge(f.id)}
                      >
                        <Send size={16} />
                        <span>문자</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="lvb-link"
                        onClick={() => onOpenFarmer(f.id)}
                      >
                        보기 <ChevronRight size={13} />
                      </button>
                    )}
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
