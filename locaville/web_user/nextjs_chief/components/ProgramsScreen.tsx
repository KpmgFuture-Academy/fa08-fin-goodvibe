"use client";

/**
 * ProgramsScreen — 사업 목록 → 상세(활동·마감 + 배정 단체 참여 토글).
 */

import { ArrowLeft, ChevronRight, Users, Clock, Check, UserPlus, Send } from "lucide-react";
import { Btn, Tag, ProgressBar } from "./chief-ui";

export interface ProgramCard {
  id: string; tag: { label: string; tone: string }; biz: string; name: string;
  issuer: string; year: number; progress: number; groupName: string; participants: number;
  nextDeadline?: { name: string; dueText: string } | null;
}
export interface DeadlineRow { name: string; dueText: string; daysLeft: number; doneCount: number; total: number; }
export interface MemberRow { id: string; name: string; age: number; phoneMasked: string; isLeader: boolean; participating: boolean; }
export interface ProgramDetailData {
  tag: { label: string; tone: string }; biz: string; name: string; issuer: string; year: number;
  groupName: string; participants: number; memberTotal: number; progress: number;
  deadlines: DeadlineRow[]; members: MemberRow[];
}

export default function ProgramsScreen({
  villageName, programs, detail, onOpen, onBack, onOpenFarmer, onToggleMember, onAddMember, onNudgeDeadline, onSeeUnsubmitted,
}: {
  villageName: string;
  programs: ProgramCard[];
  detail: ProgramDetailData | null;   // null = 목록, 값 = 상세
  onOpen: (id: string) => void;
  onBack: () => void;
  onOpenFarmer: (id: string) => void;
  onToggleMember: (memberId: string) => void;
  onAddMember: () => void;
  onNudgeDeadline: (name: string) => void;
  onSeeUnsubmitted: () => void;
}) {
  if (detail) {
    return (
      <div className="lvb-root bg-[var(--lvb-bg)] p-6">
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-extrabold text-[color:var(--lvb-ink-soft)]"><ArrowLeft size={18} />사업 목록으로</button>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--lvb-line)] bg-white p-5">
          <div>
            <Tag tone="neutral">{detail.tag.label}</Tag>
            <div className="mt-1.5 text-[14px] font-bold text-[color:var(--lvb-muted)]">{detail.biz}</div>
            <div className="text-[20px] font-extrabold text-[color:var(--lvb-ink)]">{detail.name}</div>
            <div className="mt-0.5 text-[14px] font-semibold text-[color:var(--lvb-muted)]">{detail.issuer} · {detail.year}년 · 배정 단체 {detail.groupName}</div>
          </div>
          <div className="text-right"><div className="text-[34px] font-extrabold leading-none text-[color:var(--lvb-accent)]">{Math.round(detail.progress * 100)}%</div><div className="text-[13px] font-bold text-[color:var(--lvb-muted)]">진척</div></div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* 활동·마감 */}
          <section className="rounded-2xl border border-[var(--lvb-line)] bg-white p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[16px] font-extrabold text-[color:var(--lvb-ink)]"><Clock size={18} className="text-[color:var(--lvb-accent)]" />활동 · 마감 <span className="text-[14px] font-semibold text-[color:var(--lvb-muted)]">{detail.deadlines.length}</span></h2>
            <div className="flex flex-col gap-3">
              {detail.deadlines.map((d) => {
                const t = d.daysLeft < 0 ? "danger" : d.daysLeft <= 7 ? "warn" : "neutral";
                const undone = d.total - d.doneCount;
                return (
                  <div key={d.name} className={`rounded-xl border-l-4 bg-[var(--lvb-bg-soft)] p-3.5 ${t === "danger" ? "border-[var(--lvb-danger)]" : t === "warn" ? "border-[var(--lvb-warn)]" : "border-[var(--lvb-line-2)]"}`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-[15px] font-extrabold text-[color:var(--lvb-ink)]">{d.name}</div>
                      <div className={`text-[13px] font-extrabold ${t === "danger" ? "text-[color:var(--lvb-danger)]" : t === "warn" ? "text-[color:var(--lvb-warn-ink)]" : "text-[color:var(--lvb-muted)]"}`}>{d.dueText}</div>
                    </div>
                    <ProgressBar value={d.doneCount} total={d.total} />
                    <div className="mt-1.5 text-[13px] font-bold text-[color:var(--lvb-muted)]">{d.doneCount}/{d.total} 완료{undone > 0 && <span className="text-[color:var(--lvb-warn-ink)]"> · {undone}곳 미제출</span>}</div>
                    {undone > 0 ? (
                      <div className="mt-2.5 flex gap-2">
                        <Btn variant="outline" size="md" Icon={Users} onClick={onSeeUnsubmitted}>미제출 농가 보기</Btn>
                        <Btn variant="primary" size="md" Icon={Send} onClick={() => onNudgeDeadline(d.name)}>문자로 알리기</Btn>
                      </div>
                    ) : <div className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-extrabold text-[color:var(--lvb-accent)]"><Check size={15} />모두 제출됐어요</div>}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 배정 단체 참여 */}
          <section className="rounded-2xl border border-[var(--lvb-line)] bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[16px] font-extrabold text-[color:var(--lvb-ink)]"><Users size={18} className="text-[color:var(--lvb-accent)]" />배정 단체 · 참여 농가</h2>
              <Btn variant="primary" size="sm" Icon={UserPlus} onClick={onAddMember}>농가 참여시키기</Btn>
            </div>
            <div className="mb-3 rounded-lg bg-[var(--lvb-bg-soft)] px-3 py-2 text-[13px] font-semibold text-[color:var(--lvb-muted)]">참여하지 않을 농가는 <b className="text-[color:var(--lvb-ink)]">제외</b>를 눌러 빼 주세요. 빠진 농가에는 이 사업 할 일이 가지 않아요.</div>
            <ul className="flex flex-col gap-2">
              {detail.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--lvb-bg-soft)] px-3.5 py-2.5">
                  <button onClick={() => onOpenFarmer(m.id)} className="text-left">
                    <div className="flex items-center gap-1.5 text-[15px] font-extrabold text-[color:var(--lvb-ink)]">{m.name}{m.isLeader && <span className="rounded-full bg-[var(--lvb-accent-soft)] px-1.5 py-0.5 text-[11px] font-extrabold text-[color:var(--lvb-accent-dark)]">대표</span>}</div>
                    <div className="text-[13px] font-semibold text-[color:var(--lvb-muted)]">{m.age}세 · {m.phoneMasked}</div>
                  </button>
                  <div className="flex items-center gap-2.5">
                    <span className={`text-[13px] font-extrabold ${m.participating ? "text-[color:var(--lvb-accent)]" : "text-[color:var(--lvb-muted)]"}`}>{m.participating ? "참여 중" : "참여 안 함"}</span>
                    <button onClick={() => onToggleMember(m.id)} className="rounded-lg border border-[var(--lvb-line-2)] bg-white px-2.5 py-1.5 text-[13px] font-extrabold text-[color:var(--lvb-ink)]">{m.participating ? "제외" : "참여로"}</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="lvb-root bg-[var(--lvb-bg)] p-6">
      <div className="mb-4"><h1 className="text-[24px] font-extrabold text-[color:var(--lvb-ink)]">사업</h1><p className="text-[15px] font-semibold text-[color:var(--lvb-muted)]">{villageName}에서 진행 중인 정부 사업 {programs.length}개</p></div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {programs.map((p) => (
          <button key={p.id} onClick={() => onOpen(p.id)} className="flex flex-col gap-2 rounded-2xl border border-[var(--lvb-line)] bg-white p-4 text-left">
            <div className="flex items-center justify-between"><Tag tone="neutral">{p.tag.label}</Tag><ChevronRight size={20} className="text-[color:var(--lvb-muted)]" /></div>
            <div className="text-[13px] font-bold text-[color:var(--lvb-muted)]">{p.biz}</div>
            <div className="text-[17px] font-extrabold leading-snug text-[color:var(--lvb-ink)] [word-break:keep-all]">{p.name}</div>
            <div className="text-[13px] font-semibold text-[color:var(--lvb-muted)]">{p.issuer} · {p.year}년</div>
            <div className="mt-1">
              <div className="mb-1 flex items-center justify-between text-[13px] font-bold text-[color:var(--lvb-muted)]"><span>진척</span><strong className="text-[color:var(--lvb-ink)]">{Math.round(p.progress * 100)}%</strong></div>
              <ProgressBar value={p.progress * 100} total={100} />
            </div>
            <div className="mt-1 flex flex-col gap-1 text-[13px] font-bold text-[color:var(--lvb-muted)]">
              <span className="inline-flex items-center gap-1"><Users size={14} />{p.groupName} · 참여 {p.participants}명</span>
              {p.nextDeadline && <span className="inline-flex items-center gap-1"><Clock size={14} />{p.nextDeadline.name} {p.nextDeadline.dueText}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* Claude Code: programs/detail = ville-project-api. onToggleMember → 참여/제외 PATCH. */
