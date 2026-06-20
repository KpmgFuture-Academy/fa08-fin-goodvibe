"use client";

/**
 * FarmerDetailScreen — 농가 한 분의 전체 현황(상세).
 * 소속 단체·필지·도우미 + 사업별 활동 체크리스트 + 올린 증빙 + 영농일지.
 */

import { ArrowLeft, Phone, AlertCircle, Camera, FileText, Check, HeartHandshake, MapPin, Send } from "lucide-react";
import { Btn, Tag, ProgressBar, EvThumb, STATE_LABEL, type Farmer } from "./chief-ui";

export interface ActItem { name: string; due: string; done: boolean; overdue: boolean; }
export interface ProjPanel { pid: string; biz: string; tag: { label: string; tone: string }; done: number; total: number; acts: ActItem[]; }
export interface EvidenceCell { id: string; status: "review" | "confirmed" | "retake"; label: string; when: string; img: string; src?: string; tag: { label: string; tone: string }; }
export interface LogItem { id: string; date: string; act: string; note?: string; photos: number; tag: { label: string; tone: string }; }
export interface GroupRef { id: string; name: string; isLeader: boolean; tag: { label: string; tone: string }; }

const stateTone = (s: Farmer["state"]) => (s === "good" ? "good" : s === "mid" ? "neutral" : s === "behind" ? "warn" : "danger") as const;

export default function FarmerDetailScreen({
  farmer, groups, parcels, helperName, helpingName, projects, evidence, logs, onBack, onNudge, onConnectHelper, onOpenReview,
}: {
  farmer: Farmer;
  groups: GroupRef[];
  parcels: { name: string; crop: string }[];
  helperName?: string | null;     // 이 농가를 돕는 사람
  helpingName?: string | null;    // 이 농가가 돕는 사람
  projects: ProjPanel[];
  evidence: EvidenceCell[];
  logs: LogItem[];
  onBack: () => void;
  onNudge: () => void;
  onConnectHelper: () => void;
  onOpenReview: (evId: string) => void;
}) {
  const Card = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="rounded-2xl border border-[var(--lvb-line)] bg-white p-4">
      <div className="mb-2 text-[13px] font-extrabold text-[color:var(--lvb-muted)]">{label}</div>
      {children}
    </div>
  );

  return (
    <div className="lvb-root bg-[var(--lvb-bg)] p-6">
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-extrabold text-[color:var(--lvb-ink-soft)]"><ArrowLeft size={18} />처리함으로</button>

      {/* 히어로 */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--lvb-line)] bg-white p-5">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[var(--lvb-accent-soft)] text-[26px] font-extrabold text-[color:var(--lvb-accent-dark)]">{farmer.name[0]}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[22px] font-extrabold text-[color:var(--lvb-ink)]">{farmer.name} <span className="text-[15px] font-semibold text-[color:var(--lvb-muted)]">{farmer.age}세</span><Tag tone={stateTone(farmer.state)}>{STATE_LABEL[farmer.state]}</Tag></div>
          <div className="mt-1 inline-flex items-center gap-1.5 text-[15px] font-semibold text-[color:var(--lvb-muted)]"><Phone size={15} />{farmer.phone}</div>
          {farmer.note && <div className="mt-1 inline-flex items-center gap-1.5 text-[14px] font-bold text-[color:var(--lvb-warn-ink)]"><AlertCircle size={14} />{farmer.note}</div>}
        </div>
        <div className="flex gap-2.5">
          <Btn variant="primary" size="lg" Icon={Send} onClick={onNudge}>문자로 알려주기</Btn>
          {!helperName && <Btn variant="outline" size="lg" Icon={HeartHandshake} onClick={onConnectHelper}>도우미 연결</Btn>}
        </div>
      </div>

      {/* 카드 3종 */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card label="소속 단체">
          {groups.length ? groups.map((g) => (
            <div key={g.id} className="mb-1.5 flex items-center gap-2 last:mb-0">
              <b className="text-[15px] text-[color:var(--lvb-ink)]">{g.name}</b>
              {g.isLeader && <span className="rounded-full bg-[var(--lvb-accent-soft)] px-1.5 py-0.5 text-[11px] font-extrabold text-[color:var(--lvb-accent-dark)]">대표</span>}
              <span className="ml-auto"><Tag tone="neutral">{g.tag.label}</Tag></span>
            </div>
          )) : <div className="text-[14px] font-semibold text-[color:var(--lvb-muted)]">소속 단체 없음</div>}
        </Card>
        <Card label="필지 · 작물">
          <div className="flex flex-wrap gap-1.5">
            {parcels.map((p) => <span key={p.name} className="inline-flex items-center gap-1 rounded-lg bg-[var(--lvb-bg-soft)] px-2.5 py-1.5 text-[14px] font-semibold text-[color:var(--lvb-ink-soft)]"><b className="text-[color:var(--lvb-ink)]">{p.name}</b>{p.crop}</span>)}
          </div>
        </Card>
        <Card label="기록 도우미">
          {helperName ? <div className="inline-flex items-center gap-2 text-[15px] font-extrabold text-[color:var(--lvb-ink)]"><HeartHandshake size={18} className="text-[color:var(--lvb-accent)]" />{helperName} 님이 돕는 중</div>
            : helpingName ? <div className="inline-flex items-center gap-2 text-[15px] font-extrabold text-[color:var(--lvb-ink)]"><HeartHandshake size={18} className="text-[color:var(--lvb-accent)]" />{helpingName} 님을 돕고 있어요</div>
            : <div className="text-[14px] font-semibold text-[color:var(--lvb-muted)]">연결된 도우미 없음</div>}
        </Card>
      </div>

      {/* 사업별 활동 */}
      <div className={`mt-4 grid grid-cols-1 gap-3 ${projects.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {projects.map((p) => (
          <section key={p.pid} className="rounded-2xl border border-[var(--lvb-line)] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[16px] font-extrabold text-[color:var(--lvb-ink)]">{p.biz} <span className="text-[14px] font-semibold text-[color:var(--lvb-muted)]">{p.done}/{p.total} 완료</span></h2>
              <Tag tone="neutral">{p.tag.label}</Tag>
            </div>
            <ul className="flex flex-col gap-1.5">
              {p.acts.map((a) => (
                <li key={a.name} className="flex items-center gap-2.5 rounded-lg bg-[var(--lvb-bg-soft)] px-3 py-2.5">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full ${a.done ? "bg-[var(--lvb-accent)]" : a.overdue ? "bg-[var(--lvb-danger-soft)]" : "border-2 border-[var(--lvb-line-2)]"}`}>{a.done && <Check size={13} className="text-white" />}</span>
                  <span className="flex-1 text-[15px] font-bold text-[color:var(--lvb-ink)]">{a.name}</span>
                  <span className={`text-[13px] font-extrabold ${a.overdue ? "text-[color:var(--lvb-danger)]" : "text-[color:var(--lvb-muted)]"}`}>{a.done ? "완료" : a.due}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* 올린 증빙 */}
      <section className="mt-4 rounded-2xl border border-[var(--lvb-line)] bg-white p-4">
        <h2 className="mb-3 flex items-center gap-2 text-[16px] font-extrabold text-[color:var(--lvb-ink)]"><Camera size={18} className="text-[color:var(--lvb-accent)]" />올린 증빙 <span className="text-[14px] font-semibold text-[color:var(--lvb-muted)]">{evidence.length}</span></h2>
        {evidence.length === 0 ? <div className="py-8 text-center text-[15px] font-semibold text-[color:var(--lvb-muted)]">아직 올린 사진이 없어요</div> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {evidence.map((e) => {
              const st = e.status === "confirmed" ? { t: "good" as const, l: "확인" } : e.status === "retake" ? { t: "warn" as const, l: "재촬영" } : { t: "neutral" as const, l: "검토 대기" };
              return (
                <button key={e.id} onClick={() => e.status === "review" && onOpenReview(e.id)} className="text-left">
                  <EvThumb src={e.src} label={e.label} size={140} blurry={e.img === "ph-blur"} />
                  <div className="mt-1.5 flex items-center justify-between"><Tag tone={st.t}>{st.l}</Tag><span className="text-[12px] font-semibold text-[color:var(--lvb-muted)]">{e.when}</span></div>
                  <div className="mt-0.5 truncate text-[13px] font-bold text-[color:var(--lvb-ink-soft)]">{e.label}</div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 영농일지 */}
      <section className="mt-4 rounded-2xl border border-[var(--lvb-line)] bg-white p-4">
        <h2 className="mb-3 flex items-center gap-2 text-[16px] font-extrabold text-[color:var(--lvb-ink)]"><FileText size={18} className="text-[color:var(--lvb-accent)]" />영농일지 <span className="text-[14px] font-semibold text-[color:var(--lvb-muted)]">{logs.length}</span></h2>
        <ul className="flex flex-col gap-2">
          {logs.map((l) => (
            <li key={l.id} className="flex items-center gap-3 rounded-xl bg-[var(--lvb-bg-soft)] px-3.5 py-3">
              <div className="w-[58px] shrink-0 text-[13px] font-extrabold text-[color:var(--lvb-muted)]">{l.date}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[15px] font-extrabold text-[color:var(--lvb-ink)]">{l.act} <Tag tone="neutral">{l.tag.label}</Tag></div>
                {l.note && <div className="mt-0.5 text-[14px] font-semibold text-[color:var(--lvb-muted)]">&ldquo;{l.note}&rdquo;</div>}
              </div>
              <div className="inline-flex items-center gap-1 text-[14px] font-bold text-[color:var(--lvb-muted)]"><Camera size={14} />{l.photos}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* Claude Code: farmer/groups/projects/evidence/logs 는 admin-api 의 농가 상세
   응답으로 매핑. onOpenReview → ReviewModal. onNudge/onConnectHelper → 각 모달. */
