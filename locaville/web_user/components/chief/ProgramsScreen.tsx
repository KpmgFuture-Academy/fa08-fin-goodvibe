"use client";

/**
 * ProgramsScreen — 사업 목록(lvb-projlist/lvb-projcard) + 상세(lvb-projhero/lvb-pd-deads/lvb-member-list).
 */

import {
  ArrowLeft, Briefcase, Check, ChevronRight, Clock, Send, UserPlus, Users,
} from "lucide-react";

export interface ProgramCard {
  id: string; tag: { label: string; tone: string }; biz: string; name: string;
  issuer: string; year: number; progress: number; groupName: string; participants: number;
  nextDeadline?: { name: string; dueText: string } | null;
}
export interface DeadlineRow { name: string; dueText: string; daysLeft: number; doneCount: number; total: number; }
export interface MemberRow { id: string; name: string; phoneMasked: string; isLeader: boolean; participating: boolean; }
export interface ProgramDetailData {
  tag: { label: string; tone: string }; biz: string; name: string; issuer: string; year: number;
  groupName: string; participants: number; memberTotal: number; progress: number;
  deadlines: DeadlineRow[]; members: MemberRow[];
}

function toneClass(tone: string): "t-green" | "t-blue" | "t-plum" | "t-clay" | "t-amber" {
  if (tone === "blue") return "t-blue";
  if (tone === "plum") return "t-plum";
  if (tone === "clay") return "t-clay";
  if (tone === "amber") return "t-amber";
  return "t-green";
}

export default function ProgramsScreen({
  villageName, programs, detail, onOpen, onBack, onOpenFarmer, onToggleMember, onAddMember, onNudgeDeadline, onSeeUnsubmitted, onAddProject,
}: {
  villageName: string;
  programs: ProgramCard[];
  detail: ProgramDetailData | null;
  onOpen: (id: string) => void;
  onBack: () => void;
  onOpenFarmer: (id: string) => void;
  onToggleMember: (memberId: string) => void;
  onAddMember: () => void;
  onNudgeDeadline: (name: string) => void;
  onSeeUnsubmitted: () => void;
  /** list 모드 우상단의 "사업 추가" 버튼. 누락 시 버튼 안 보임. */
  onAddProject?: () => void;
}) {
  if (detail) {
    const tcl = toneClass(detail.tag.tone);
    return (
      <div>
        <button type="button" className="lvb-back" onClick={onBack}>
          <ArrowLeft size={18} />사업 목록으로
        </button>

        <div className={`lvb-projhero ${tcl}`}>
          <div>
            <span className={`lvb-projtag big ${tcl}`}>{detail.tag.label}</span>
            <div className="lvb-projhero-biz">{detail.biz}</div>
            <div className="lvb-projhero-name">{detail.name}</div>
            <div className="lvb-projhero-meta">
              {detail.issuer} · {detail.year}년 · 배정 단체 {detail.groupName || "—"}
            </div>
          </div>
          <div className="lvb-projhero-pct">
            {Math.round(detail.progress * 100)}%
            <span>진척</span>
          </div>
        </div>

        <div className="lvb-detail-split">
          <section className="lvb-panel">
            <div className="lvb-sec-head">
              <div className="lvb-sec-head-l">
                <span className="lvb-sec-ic t-green"><Clock size={18} /></span>
                <span className="lvb-sec-title">활동 · 마감</span>
                <span className="lvb-sec-count">{detail.deadlines.length}</span>
              </div>
            </div>
            <div className="lvb-pd-deads">
              {detail.deadlines.map((d) => {
                const t = d.daysLeft < 0 ? "danger" : d.daysLeft <= 7 ? "warn" : "neutral";
                const undone = d.total - d.doneCount;
                return (
                  <div key={d.name} className={`lvb-pd-dead t-${t}`}>
                    <div className="lvb-pd-dead-top">
                      <div className="lvb-deadline-name">{d.name}</div>
                      <div className={`lvb-pd-dead-due t-${t}`}>{d.dueText}</div>
                    </div>
                    <div className="lvb-progress" style={{ height: 8 }}>
                      <span style={{
                        width: d.total ? `${(d.doneCount / d.total) * 100}%` : "0%",
                        background: t === "neutral" ? "var(--lvb-accent)" : "var(--lvb-clay)",
                      }} />
                    </div>
                    <div className="lvb-deadline-count">
                      {d.doneCount}/{d.total} 완료
                      {undone > 0 && <span className="lvb-deadline-undone"> · {undone}곳 미제출</span>}
                    </div>
                    {undone > 0 ? (
                      <div className="lvb-pd-dead-acts">
                        <button type="button" className="lvb-btn lvb-btn-outline lvb-btn-md" onClick={onSeeUnsubmitted}>
                          <Users size={19} />
                          <span>미제출 농가 보기</span>
                        </button>
                        <button type="button" className="lvb-btn lvb-btn-primary lvb-btn-md" onClick={() => onNudgeDeadline(d.name)}>
                          <Send size={19} />
                          <span>문자로 알리기</span>
                        </button>
                      </div>
                    ) : (
                      <div className="lvb-pd-dead-clear"><Check size={15} />모두 제출됐어요</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="lvb-panel">
            <div className="lvb-sec-head">
              <div className="lvb-sec-head-l">
                <span className="lvb-sec-ic t-green"><Users size={18} /></span>
                <span className="lvb-sec-title">배정 단체 · 참여 농가</span>
                <span className="lvb-sec-sub">
                  {detail.groupName || "—"} · 참여 {detail.participants} / {detail.memberTotal}명
                </span>
              </div>
              <button type="button" className="lvb-btn lvb-btn-primary lvb-btn-sm" onClick={onAddMember}>
                <UserPlus size={16} />
                <span>농가 참여시키기</span>
              </button>
            </div>
            <div className="lvb-engage-hint">
              참여하지 않을 농가는 <b>제외</b>를 눌러 빼 주세요. 빠진 농가에는 이 사업 할 일이 가지 않아요.
            </div>
            <ul className="lvb-member-list">
              {detail.members.map((m) => (
                <li key={m.id} className="lvb-member">
                  <button type="button" className="lvb-member-id" onClick={() => onOpenFarmer(m.id)}>
                    <div>
                      <div className="lvb-member-name">
                        {m.name}
                        {m.isLeader && <span className="lvb-leader-pill">대표</span>}
                      </div>
                      <div className="lvb-member-sub">{m.phoneMasked}</div>
                    </div>
                  </button>
                  <div className="lvb-member-right">
                    <span className="lvb-engage-state">
                      {m.participating ? (
                        <span className="lvb-engage-on"><Check size={15} />참여 중</span>
                      ) : (
                        <span className="lvb-engage-off">참여 안 함</span>
                      )}
                    </span>
                    <button type="button" className="lvb-engage-act" onClick={() => onToggleMember(m.id)}>
                      {m.participating ? "제외" : "참여로"}
                    </button>
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
    <div className="lvb-screen-pad">
      <div className="lvb-page-head">
        <div>
          <h1>사업</h1>
          <p>{villageName}에서 진행 중인 정부 사업 {programs.length}개</p>
        </div>
        {onAddProject && (
          <div className="lvb-page-head-tools">
            <button
              type="button"
              className="lvb-btn lvb-btn-primary lvb-btn-md"
              onClick={onAddProject}
            >
              <Briefcase size={19} />
              <span>사업 추가</span>
            </button>
          </div>
        )}
      </div>
      <div className="lvb-projlist">
        {programs.map((p) => {
          const tcl = toneClass(p.tag.tone);
          return (
            <button key={p.id} type="button" className={`lvb-projcard ${tcl}`} onClick={() => onOpen(p.id)}>
              <div className="lvb-projcard-head">
                <span className={`lvb-projtag ${tcl}`}>{p.tag.label}</span>
                <ChevronRight size={20} />
              </div>
              <div className="lvb-projcard-biz">{p.biz}</div>
              <div className="lvb-projcard-name">{p.name}</div>
              <div className="lvb-projcard-meta">{p.issuer} · {p.year}년</div>
              <div className="lvb-projcard-prog">
                <div className="lvb-projcard-prog-head">
                  <span>진척</span>
                  <strong>{Math.round(p.progress * 100)}%</strong>
                </div>
                <div className="lvb-progress" style={{ height: 8 }}>
                  <span style={{
                    width: `${p.progress * 100}%`,
                    background:
                      tcl === "t-blue" ? "var(--lvb-blue)" :
                      tcl === "t-plum" ? "var(--lvb-plum)" :
                      tcl === "t-clay" ? "var(--lvb-clay)" :
                      "var(--lvb-accent)",
                  }} />
                </div>
              </div>
              <div className="lvb-projcard-foot">
                <span><Users size={14} />{p.groupName || "—"} · 참여 {p.participants}명</span>
                {p.nextDeadline && (
                  <span className="lvb-projcard-due">
                    <Clock size={14} />
                    {p.nextDeadline.name} {p.nextDeadline.dueText}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
