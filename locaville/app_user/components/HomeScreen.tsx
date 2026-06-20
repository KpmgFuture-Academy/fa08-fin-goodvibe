"use client";

/**
 * HomeScreen — Focus Mode(쉬운 화면).
 * Adaptive Field Interface 의 저밀도 모드: 한 화면 한 행동, 24px 상태 문장,
 * 메인 카드 1장 + 운영 상태 + 빠른 기록만 노출한다.
 * (Overview Mode = StandardHomeList.tsx — 목록 중심 밀도형)
 * 우선순위: 이장님 재촬영 요청 → 오늘 할 일(사진) → 자유 기록 → 농사 도와주기.
 *
 * 이 파일은 "표현(presentational)" 컴포넌트입니다. 데이터는 props 로 받습니다.
 * Claude Code 연결 가이드는 파일 하단 주석 + HANDOFF.md 참고.
 */

import { Camera, CalendarClock, CheckCircle2, PenLine, ChevronRight, MapPin, Calendar, Users } from "lucide-react";
import { useState } from "react";
import type { TodoItemApi } from "@/lib/todo-service";
import { chooseTodoWindow, choiceOptionsFor, isChoiceJob } from "@/lib/todo-service";
import { getEvidenceKind, getEvidenceActionLabel, getJobActionLabel } from "@/lib/display-labels";

// ── 보조 타입 ──
export interface RetakeRequest {
  evidence_id: string;
  parcel_no?: string;
  job_name?: string;
  /** 이장님이 남긴 안내(짧게). */
  message: string;
}
export interface ParcelRef {
  parcel_no: string;
  /** "1번 논 (벼)" */
  label: string;
  /** "논" / "밭" */
  kind: string;
}

interface HomeScreenProps {
  userName: string;
  /** true = 쉬운 화면(큰 글씨·한 번에 하나), false = 표준 화면. */
  simple: boolean;
  /** 미완료 할 일(가까운 마감 순 정렬 권장). */
  todos: TodoItemApi[];
  parcels: ParcelRef[];
  /** 농가 식별자 — choice 시즌 선택 API 호출에 사용 (없으면 토글 비활성). */
  farmerId?: string;
  /** choice 선택으로 일정 갱신된 후 호출되면 부모가 데이터 refetch. */
  onDataChanged?: () => void;
  /** 이장님 재촬영 요청(없으면 null). */
  retake: RetakeRequest | null;
  helperRecipientName?: string | null;
  helperModeOn?: boolean;
  /** 오늘 한마디 (advice). 없으면 미표시. */
  advice?: string | null;
  navigate: (screen: string) => void;
  onTodoAction: (action: "record" | "photo", todo: TodoItemApi | null) => void;
  onStartRetake?: () => void;
  onToggleHelperMode?: (on: boolean) => void;
}

const ACTIVITY_GUIDE: Record<string, string> = {
  LCP_AWD: "논물이 빠진 모습이 보이게 찍어주세요",
  LCP_DRAIN: "물이 빠진 논과 물꼬가 보이게 찍어주세요",
  LCP_BIOCHAR: "밭에 뿌린 모습이 보이게 찍어주세요",
  LCP_FERT: "비료 준 곳이 보이게 찍어주세요",
  LCP_EDU: "교육 이수증을 올려주세요",
};
// 증빙 종류(사진/영수증/이수증)는 required_evidence_types 코드로 판별 (display-labels).
const kindOf = (t?: TodoItemApi) => getEvidenceKind(t?.required_evidence_types);
const actionLabelFor = (t?: TodoItemApi) => getEvidenceActionLabel(kindOf(t)).button;
const guideFor = (t?: TodoItemApi) => {
  if (!t) return "작업한 곳이 잘 보이게 찍어주세요";
  const kind = kindOf(t);
  // 사진은 작업별 구체 가이드 우선, 영수증/이수증은 종류별 안내.
  if (kind === "photo") return ACTIVITY_GUIDE[t.job_cd] || getEvidenceActionLabel(kind).guide;
  return getEvidenceActionLabel(kind).guide;
};
// "왜 오늘 우선인가" — 필요한 증빙 종류를 메타 행으로 노출.
const evidenceNeedFor = (t?: TodoItemApi) => {
  const k = kindOf(t);
  return k === "receipt" ? "영수증 사진 필요" : k === "certificate" ? "이수증 사진 필요" : "작업 사진 필요";
};
// 안내문을 문장 단위 줄로 분리 — 고령 가독성(짧은 줄 2개가 긴 줄 1개보다 읽기 쉬움).
const guideLines = (g: string) => g.split(". ").map((s, i, arr) => (i < arr.length - 1 ? `${s}.` : s));

// 마감 표기: "6월 30일 · 19일 남음" — 날짜와 남은 일수를 함께 보여 고령 사용자도 바로 읽게.
function dueLabel(due: string | null): { text: string; warn: boolean } {
  if (!due) return { text: "기한 미정", warn: false };
  const d = new Date(`${due}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
  const ymd = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  if (diff < 0) return { text: "기한 지남 · 오늘 처리", warn: true };
  if (diff === 0) return { text: "오늘까지", warn: true };
  return { text: `${ymd} · ${diff}일 남음`, warn: diff <= 3 };
}

export default function HomeScreen({
  userName, simple, todos, parcels, retake, farmerId, onDataChanged,
  helperRecipientName, helperModeOn, navigate, onTodoAction, onStartRetake, onToggleHelperMode,
}: HomeScreenProps) {
  const pending = todos;
  const urgent = pending[0];
  const urgentParcel = urgent ? parcels.find((p) => p.parcel_no === urgent.parcel_no) : undefined;
  const retakeParcel = retake ? parcels.find((p) => p.parcel_no === retake.parcel_no) : undefined;
  // 재촬영 대상 작업을 찾아 증빙 종류별 촬영 안내문을 구성 (표시 전용).
  const retakeTodo = retake
    ? pending.find((t) => t.job_name === retake.job_name && (!retake.parcel_no || t.parcel_no === retake.parcel_no))
    : undefined;
  const retakeGuide = retakeTodo ? guideFor(retakeTodo) : null;
  const mode: "retake" | "todo" | "free" = retake ? "retake" : urgent ? "todo" : "free";

  const status =
    mode === "retake" ? "확인할 사진이 1장 있어요"
    : mode === "todo" ? `오늘 할 일이 ${pending.length}개 있어요`
    : "오늘 챙길 할 일은 없어요";

  return (
    // pb: 하단 탭과 마지막 카드 사이 시각 여백 24~32px (safe-area 포함, 과한 빈 공간 방지).
    <div className="lv-stagger relative flex h-full flex-col gap-4 overflow-y-auto px-5 pb-[calc(28px+env(safe-area-inset-bottom))] pt-4">
      {/* 사용자 상태 — 업무 상태 한 문장 */}
      <header className="shrink-0 px-0.5">
        <h1 className="text-[24px] font-bold leading-snug tracking-tight text-[color:var(--lv-ink)] [word-break:keep-all]">
          {userName}님, {status}
        </h1>
      </header>

      {/* A. 재촬영 요청 — 강한 행동 하나 */}
      {mode === "retake" && retake && (
        <HeroShell>
          <div className="flex flex-col gap-2.5">
            <p className="text-[14px] font-semibold tracking-[0.02em] text-[color:var(--lv-ink-soft)]">사진 확인</p>
            <div className="-mt-1 flex items-start justify-between gap-2">
              <p className="text-[23px] font-bold leading-snug tracking-tight text-[color:var(--lv-ink)] [word-break:keep-all]">
                사진 재촬영 요청
              </p>
              <span className="mt-0.5 shrink-0 rounded-full bg-[var(--lv-warn-soft)] px-3 py-1 text-[14px] font-semibold text-[color:var(--lv-warn)]">확인 필요</span>
            </div>
            {(retakeParcel || retake.job_name) && (
              <div className="flex flex-col gap-1">
                {retakeParcel && (
                  <div className="flex items-baseline gap-3">
                    <span className="w-[42px] shrink-0 text-[14px] font-semibold text-[color:var(--lv-ink-soft)]">위치</span>
                    <span className="min-w-0 text-[16px] font-semibold text-[color:var(--lv-ink)] [word-break:keep-all]">{retakeParcel.label}</span>
                  </div>
                )}
                {retake.job_name && (
                  <div className="flex items-baseline gap-3">
                    <span className="w-[42px] shrink-0 text-[14px] font-semibold text-[color:var(--lv-ink-soft)]">할 일</span>
                    <span className="min-w-0 text-[16px] font-semibold text-[color:var(--lv-ink)] [word-break:keep-all]">{getJobActionLabel(retake.job_name)}</span>
                  </div>
                )}
              </div>
            )}
            <div className="rounded-xl bg-[var(--lv-warn-soft)] px-4 py-3">
              <p className="text-[14px] font-semibold tracking-tight text-[color:var(--lv-warn)]">이장님 확인 결과</p>
              <p className="mt-1 text-[17px] font-medium leading-[1.5] text-[color:var(--lv-ink)] [word-break:keep-all]">{retake.message}</p>
            </div>
            {retakeGuide && (
              <div className="flex items-start gap-2 rounded-xl bg-[var(--lv-surface-soft)] px-3.5 py-2.5">
                <Camera size={16} className="mt-[3px] shrink-0 text-[color:var(--lv-primary)]" />
                <p className="text-[16px] font-medium leading-[1.5] text-[color:var(--lv-ink-soft)] [word-break:keep-all]">
                  {guideLines(retakeGuide).map((ln, i) => <span key={i} className="block">{ln}</span>)}
                </p>
              </div>
            )}
          </div>
          <GiantButton tone="primary" icon={<Camera size={22} />} label="다시 촬영하기"
            onClick={() => { onStartRetake?.(); onTodoAction("photo", null); navigate("photoInput"); }} />
        </HeroShell>
      )}

      {/* B. 오늘 사진으로 완료할 일 */}
      {mode === "todo" && urgent && (
        <HeroShell>
          <div className="flex flex-col gap-2">
            <p className="text-[14px] font-semibold tracking-[0.02em] text-[color:var(--lv-ink-soft)]">오늘 우선</p>
            <p className="-mt-0.5 text-[24px] font-bold leading-tight tracking-tight text-[color:var(--lv-ink)] [word-break:keep-all]">{getJobActionLabel(urgent.job_name)}</p>
            <div className="flex flex-col gap-1">
              {urgentParcel && (
                <div className="flex items-baseline gap-3">
                  <span className="w-[42px] shrink-0 text-[14px] font-semibold text-[color:var(--lv-ink-soft)]">위치</span>
                  <span className="min-w-0 text-[16px] font-semibold text-[color:var(--lv-ink)] [word-break:keep-all]">{urgentParcel.label}</span>
                </div>
              )}
              <div className="flex items-baseline gap-3">
                <span className="w-[42px] shrink-0 text-[14px] font-semibold text-[color:var(--lv-ink-soft)]">마감</span>
                <span className={`min-w-0 inline-flex items-center gap-1.5 text-[16px] font-semibold [word-break:keep-all] ${dueLabel(urgent.due_date).warn ? "text-[color:var(--lv-urgent)]" : "text-[color:var(--lv-ink)]"}`}>
                  {dueLabel(urgent.due_date).warn ? `마감 임박 · ${dueLabel(urgent.due_date).text}` : dueLabel(urgent.due_date).text}
                </span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="w-[42px] shrink-0 text-[14px] font-semibold text-[color:var(--lv-ink-soft)]">증빙</span>
                <span className="min-w-0 text-[16px] font-semibold text-[color:var(--lv-ink)] [word-break:keep-all]">{evidenceNeedFor(urgent)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-[var(--lv-surface-soft)] px-3.5 py-2.5">
            <Camera size={16} className="mt-[3px] shrink-0 text-[color:var(--lv-primary)]" />
            <p className="text-[16px] font-medium leading-[1.5] text-[color:var(--lv-ink-soft)] [word-break:keep-all]">
              {guideLines(guideFor(urgent)).map((ln, i) => <span key={i} className="block">{ln}</span>)}
            </p>
          </div>
          <GiantButton tone="primary" icon={<Camera size={22} />} label={actionLabelFor(urgent)}
            onClick={() => { onTodoAction("photo", urgent); navigate("photoInput"); }} />
          {/* choice 타입(예: 바이오차) — "다른 시즌으로 미루기" 한 줄 */}
          <ChoiceShifter todo={urgent} farmerId={farmerId} onShifted={onDataChanged} />
          {pending.length > 1 && (
            <button onClick={() => navigate("journal")} className="min-h-[48px] w-full text-[15px] font-medium text-[color:var(--lv-ink-soft)] underline underline-offset-4">
              다른 할 일 {pending.length - 1}개 보기
            </button>
          )}
        </HeroShell>
      )}

      {/* 오늘 운영 상태 — 재촬영/자유 모드에서 미니 대시보드 (todo 모드는 카드가 현황을 겸함) */}
      {mode !== "todo" && (
        <section className="shrink-0 rounded-[24px] bg-[var(--lv-card)] p-5 shadow-[0_2px_8px_rgba(23,35,27,0.05)]">
          <h2 className="text-[14px] font-semibold tracking-[0.02em] text-[color:var(--lv-ink-soft)]">오늘 운영 상태</h2>
          {/* 정보 행(label/value) — 버튼처럼 보이지 않게 박스·라운드 제거. 메인 CTA 보다 약한 위계 유지. */}
          <div className="mt-1 flex flex-col divide-y divide-[var(--lv-line-soft)]">
            <div className="flex items-baseline justify-between py-2.5">
              <span className="text-[16px] font-semibold text-[color:var(--lv-ink-soft)]">재촬영</span>
              <span className={`text-[20px] font-bold leading-tight tracking-tight ${retake ? "text-[color:var(--lv-warn)]" : "text-[color:var(--lv-ink)]"}`}>
                {retake ? 1 : 0}<span className="ml-0.5 text-[15px] font-semibold text-[color:var(--lv-ink-soft)]">장</span>
              </span>
            </div>
            <div className="flex items-baseline justify-between py-2.5">
              <span className="text-[16px] font-semibold text-[color:var(--lv-ink-soft)]">남은 할 일</span>
              <span className="text-[20px] font-bold leading-tight tracking-tight text-[color:var(--lv-ink)]">
                {pending.length}<span className="ml-0.5 text-[15px] font-semibold text-[color:var(--lv-ink-soft)]">개</span>
              </span>
            </div>
          </div>
          {!retake && pending.length === 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-[16px] font-semibold text-[color:var(--lv-primary)]">
              <CheckCircle2 size={18} className="shrink-0" /> 오늘 확인할 항목을 모두 마쳤어요
            </p>
          )}
          <p className={`${!retake && pending.length === 0 ? "mt-1" : "mt-3"} text-[16px] font-medium leading-[1.5] text-[color:var(--lv-ink-soft)] [word-break:keep-all]`}>
            오늘 하신 일이 있다면 기록으로 남겨주세요.
          </p>
        </section>
      )}

      {/* Quick Capture — 모든 모드 공통 기록 진입 */}
      <button onClick={() => { onTodoAction("record", null); navigate("manualInput"); }}
        className="flex min-h-[92px] w-full shrink-0 items-center gap-4 rounded-[24px] bg-[var(--lv-card)] p-5 text-left shadow-[0_2px_8px_rgba(23,35,27,0.05)]">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-[var(--lv-accent-soft)]">
          <PenLine size={25} strokeWidth={2} className="text-[color:var(--lv-primary)]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold tracking-[0.02em] text-[color:var(--lv-ink-soft)]">빠른 기록</span>
          <span className="mt-0.5 block text-[19px] font-bold leading-snug text-[color:var(--lv-ink)]">오늘 한 일 남기기</span>
          <span className="mt-0.5 block text-[15px] font-medium leading-snug text-[color:var(--lv-ink-soft)] [word-break:keep-all]">말로 남기거나 직접 적을 수 있어요</span>
        </span>
        <ChevronRight size={26} strokeWidth={2.2} className="shrink-0 text-[color:var(--lv-ink-soft)]" />
      </button>

      {/* 농사 도와주기 */}
      {helperRecipientName && (
        <button onClick={() => onToggleHelperMode?.(!helperModeOn)}
          className="flex min-h-[68px] w-full shrink-0 items-center gap-3.5 rounded-[24px] bg-[var(--lv-card)] px-5 py-4 text-left shadow-[0_2px_8px_rgba(23,35,27,0.05)]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--lv-accent-soft)]">
            <Users size={22} strokeWidth={2} className="text-[color:var(--lv-primary)]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0 text-[17px] font-semibold leading-snug text-[color:var(--lv-ink)] [word-break:keep-all]">{helperRecipientName}님 기록 도와주러 가기</span>
              <span className="mt-0.5 shrink-0 rounded-full bg-[var(--lv-accent-soft)] px-2.5 py-0.5 text-[13px] font-semibold text-[color:var(--lv-primary)]">도움 가능</span>
            </span>
            <span className="mt-1 block text-[14px] font-medium leading-snug text-[color:var(--lv-ink-soft)] [word-break:keep-all]">서로 동의한 기록만 도와드려요</span>
          </span>
          <ChevronRight size={22} className="shrink-0 text-[color:var(--lv-ink-soft)]" />
        </button>
      )}
    </div>
  );
}

// ── 공용 ──
function HeroShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex shrink-0 flex-col gap-3.5 rounded-[28px] bg-[var(--lv-card)] p-6 shadow-[0_2px_8px_rgba(23,35,27,0.05)]">
      {children}
    </section>
  );
}

/**
 * choice 타입 todo (예: 바이오차) 에서 "지금 시즌 말고 다른 시즌으로 미루기" 한 줄.
 * 룰에 정의된 옵션 중 현재 활성 윈도우와 다른 옵션을 선택. 클릭 시 backend 가
 * prj_todo_list.est_*_date 를 그 시즌으로 UPDATE → 다음 fetch 때 해당 시즌까지 안 보임.
 */
function ChoiceShifter({
  todo, farmerId, onShifted,
}: {
  todo: TodoItemApi;
  farmerId?: string;
  onShifted?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!todo.job_cd || !isChoiceJob(todo.job_cd) || !farmerId || !todo.prj_id) return null;

  const opts = choiceOptionsFor(todo.job_cd);
  // 현재 todo 의 due_date (est_end_date) 가 어느 옵션 시즌에 속하는지 판단해 다른 옵션을 미루기 대상으로.
  // 간단화: 첫 옵션이 활성이면 두 번째 옵션 (그 반대도). 옵션 1개뿐이면 표시 안 함.
  if (opts.length < 2) return null;
  const dueIso = (todo.due_date || "").slice(0, 10);
  const dueMonth = dueIso ? parseInt(dueIso.slice(5, 7), 10) : new Date().getMonth() + 1;
  // 봄(3-5월) 인지 가을(8-9월) 인지 — RD001 기준. 다른 choice 작업에도 동일 휴리스틱.
  const isSpring = dueMonth >= 3 && dueMonth <= 5;
  const targetIdx = isSpring ? 1 : 0;
  const target = opts[targetIdx];
  if (!target) return null;

  const handleShift = async () => {
    if (busy) return;
    setBusy(true);
    await chooseTodoWindow({
      farmer_id: farmerId,
      prj_id: todo.prj_id || "",
      job_cd: todo.job_cd || "",
      chosen_label: target.label,
    });
    setBusy(false);
    onShifted?.();
  };
  return (
    <button
      type="button"
      onClick={handleShift}
      disabled={busy}
      className="mt-1 inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-[var(--lv-line)] bg-[var(--lv-card)] px-3 text-[15px] font-bold text-[color:var(--lv-ink-soft)] disabled:opacity-60">
      <CalendarClock size={17} className="shrink-0 text-[color:var(--lv-primary)]" />
      {busy ? "옮기는 중…" : `${target.label}에 할게요`}
    </button>
  );
}

function GiantButton({ tone, icon, label, onClick }: { tone: "primary" | "warn"; icon: React.ReactNode; label: string; onClick: () => void }) {
  const bg = tone === "warn" ? "bg-[var(--lv-warn)]" : "bg-[var(--lv-primary)]";
  return (
    <button onClick={onClick}
      className={`flex min-h-[72px] w-full items-center justify-center gap-2 rounded-[20px] ${bg} px-4 text-[20px] font-bold tracking-tight text-white active:translate-y-px`}>
      {icon}{label}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────
   Claude Code 연결 가이드
   ────────────────────────────────────────────────────────────── */
// 1) todos:    getTodayTodos(farmer_id) → status!=="completed" 필터 →
//              due_date 오름차순 정렬해서 전달.
// 2) retake:   listEvidenceRecords(farmer_id) 중 "재촬영 요청(rejected/retake)"
//              상태 1건을 RetakeRequest 로 매핑. parcel_no/job_name 채우기.
// 3) parcels:  parcel-service / parcel-reference 에서 ParcelRef[] 구성.
// 4) simple:   isSimpleMode() + onPreferencesChanged 구독으로 전달.
// 5) helper*:  useHelperMode() 의 pair/role/모드 토글을 매핑.
// 6) onStartRetake: 재촬영 진입 플래그 — 사진 저장 성공 시 해당 evidence 를
//              "재요청 해소" 처리하도록 PhotoInputScreen onPhotoSaved 와 연동.
// 표준 화면(밀도형) 목록 레이아웃은 StandardHomeList.tsx 로 분리 예정.
