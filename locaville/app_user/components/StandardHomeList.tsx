"use client";

/**
 * StandardHomeList — Overview Mode(표준 화면).
 * Adaptive Field Interface 의 밀도형 모드: 한 화면에서 재촬영·할 일 목록·기록 진입을
 * 모두 훑는다. (Focus Mode = HomeScreen.tsx — 한 화면 한 행동, 큰 글씨)
 * 인사 → (재촬영 배너) → 오늘 할 일 N개 → 오늘 한 일 남기기 → 농사 도와주기.
 * 데이터 계약은 HomeScreen.tsx 와 동일(props 로 주입).
 */

import { Camera, PenLine, Repeat, MapPin, ChevronRight, FileText, Users } from "lucide-react";
import type { TodoItemApi } from "@/lib/todo-service";
import type { RetakeRequest, ParcelRef } from "./HomeScreen";
import { getEvidenceKind, getEvidenceActionLabel } from "@/lib/display-labels";
import { JobIcon } from "./JobIcon";

interface StandardHomeListProps {
  userName: string;
  todos: TodoItemApi[];
  parcels: ParcelRef[];
  retake: RetakeRequest | null;
  advice?: string | null;
  helperRecipientName?: string | null;
  helperModeOn?: boolean;
  navigate: (screen: string) => void;
  onTodoAction: (action: "record" | "photo", todo: TodoItemApi | null) => void;
  onStartRetake?: () => void;
  onToggleHelperMode?: (on: boolean) => void;
}

// 증빙 종류 — 코드 기반(사진/영수증/이수증). 모든 종류는 사진 업로드 화면(photoInput)으로.
const kindOf = (t: TodoItemApi) => getEvidenceKind(t.required_evidence_types);

// 마감 표기: text = "6월 30일 · 19일 남음"(카드용), short = "6월 30일"(행 메타용).
function stdDue(due: string | null): { text: string; short: string; warn: boolean } {
  if (!due) return { text: "기한 미정", short: "기한 미정", warn: false };
  const d = new Date(`${due}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
  const ymd = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  if (diff < 0) return { text: "기한 지남 · 오늘 처리", short: "기한 지남", warn: true };
  if (diff === 0) return { text: "오늘까지", short: "오늘까지", warn: true };
  return { text: `${ymd} · ${diff}일 남음`, short: ymd, warn: diff <= 7 };
}

export default function StandardHomeList({
  userName, todos, parcels, retake, helperRecipientName, helperModeOn,
  navigate, onTodoAction, onStartRetake, onToggleHelperMode,
}: StandardHomeListProps) {
  const pending = todos;
  const retakeParcel = retake ? parcels.find((p) => p.parcel_no === retake.parcel_no) : undefined;
  // 메인 카드(재촬영)와 같은 작업은 목록에서 제외 — 같은 항목이 두 번 보이지 않게 (표시 전용 필터).
  const retakeTodo = retake
    ? pending.find((t) => t.job_name === retake.job_name && (!retake.parcel_no || t.parcel_no === retake.parcel_no))
    : undefined;
  // 재촬영 대상 작업의 증빙 종류로 촬영 안내문 구성 (예: 영수증 → "구매한 농자재 영수증을 찍어주세요…").
  const retakeGuide = retakeTodo ? getEvidenceActionLabel(kindOf(retakeTodo)).guide : null;
  // 재촬영이 없으면 가장 급한 할 일(due 임박 순 1순위)을 메인 카드로 승격. 목록은 나머지.
  const promoted = !retake && pending.length > 0 ? pending[0] : null;
  const promotedParcel = promoted ? parcels.find((p) => p.parcel_no === promoted.parcel_no) : undefined;
  const promotedDue = promoted ? stdDue(promoted.due_date) : null;
  const promotedGuide = promoted ? getEvidenceActionLabel(kindOf(promoted)).guide : null;
  const promotedLabel = promoted
    ? (kindOf(promoted) === "receipt" ? "영수증 올리기" : kindOf(promoted) === "certificate" ? "이수증 올리기" : "사진 찍고 완료하기")
    : "";
  // 같은 작업(작업명·필지·마감 동일)이 메인 카드와 목록에 중복 노출되지 않게 하는 표시 전용 방어.
  const sameTask = (a: TodoItemApi, b: TodoItemApi) =>
    a.todo_id === b.todo_id || (a.job_name === b.job_name && a.parcel_no === b.parcel_no && a.due_date === b.due_date);
  const listTodos = promoted
    ? pending.slice(1).filter((t) => !sameTask(t, promoted))
    : retakeTodo ? pending.filter((t) => t !== retakeTodo) : pending;
  const top = listTodos.slice(0, 3);

  return (
    <div className="lv-stagger flex min-h-full flex-col gap-4 bg-[var(--lv-bg)] px-5 pb-[calc(28px+env(safe-area-inset-bottom))] pt-4">
      {/* 인사 */}
      <div>
        <p className="text-[21px] font-bold tracking-tight text-[color:var(--lv-ink)]">{userName}님, 오늘도 수고 많으세요</p>
        <p className="mt-1 text-[15px] font-medium text-[color:var(--lv-ink-soft)]">
          {retake ? "확인할 사진이 1장 있어요" : `이번 주 챙길 일 ${pending.length}개`}
        </p>
      </div>

      {/* 재촬영 배너 */}
      {retake && (
        <button onClick={() => { onStartRetake?.(); onTodoAction("photo", null); navigate("photoInput"); }}
          className="flex w-full flex-col gap-3 rounded-[28px] bg-[var(--lv-card)] p-5 text-left shadow-[0_2px_8px_rgba(23,35,27,0.05)]">
          <div className="flex w-full items-center gap-2.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--lv-warn-soft)]"><Repeat size={22} className="text-[color:var(--lv-warn)]" /></div>
            <p className="min-w-0 flex-1 text-[18px] font-bold leading-snug text-[color:var(--lv-ink)] [word-break:keep-all]">사진 재촬영 요청</p>
            <span className="shrink-0 rounded-full bg-[var(--lv-warn-soft)] px-2.5 py-1 text-[14px] font-semibold text-[color:var(--lv-warn)]">확인 필요</span>
          </div>
          {retakeParcel && (
            <p className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[color:var(--lv-ink-soft)] [word-break:keep-all]">
              <MapPin size={14} className="shrink-0" /> {retakeParcel.label} · {retake.job_name}
            </p>
          )}
          <div className="w-full rounded-xl bg-[var(--lv-warn-soft)] px-3.5 py-3">
            <p className="text-[14px] font-semibold text-[color:var(--lv-warn)]">이장님 확인 결과</p>
            <p className="mt-1 text-[15px] font-medium leading-snug text-[color:var(--lv-ink)] [word-break:keep-all]">{retake.message}</p>
          </div>
          {retakeGuide && (
            <p className="inline-flex items-start gap-1.5 text-[15px] font-medium leading-[1.5] text-[color:var(--lv-ink-soft)] [word-break:keep-all]">
              <Camera size={16} className="mt-0.5 shrink-0 text-[color:var(--lv-primary)]" /> {retakeGuide}
            </p>
          )}
          <div className="flex min-h-[64px] w-full items-center justify-center gap-2 rounded-[18px] bg-[var(--lv-primary)] text-[18px] font-bold text-white">
            <Camera size={20} /> 다시 촬영하기
          </div>
        </button>
      )}

      {/* 가장 급한 일 — 재촬영이 없을 때 1순위 할 일을 주황 박스로 */}
      {promoted && (
        <button onClick={() => { onTodoAction("photo", promoted); navigate("photoInput"); }}
          className="flex w-full flex-col gap-3 rounded-[28px] bg-[var(--lv-card)] p-5 text-left shadow-[0_2px_8px_rgba(23,35,27,0.05)]">
          <p className="text-[14px] font-semibold tracking-[0.02em] text-[color:var(--lv-ink-soft)]">우선 처리할 일</p>
          <div className="-mt-1 flex w-full items-center gap-2.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--lv-accent-soft)]"><JobIcon jobCd={promoted.job_cd} size={22} className="text-[color:var(--lv-primary)]" /></div>
            <p className="min-w-0 flex-1 text-[21px] font-bold leading-snug text-[color:var(--lv-ink)] [word-break:keep-all]">{promoted.job_name}</p>
            <span className="shrink-0 rounded-full bg-[var(--lv-primary)] px-2.5 py-1 text-[14px] font-semibold text-white">오늘 우선</span>
          </div>
          <div className="flex flex-col gap-1">
            {promotedParcel && (
              <div className="flex items-baseline gap-3">
                <span className="w-[38px] shrink-0 text-[14px] font-semibold text-[color:var(--lv-ink-soft)]">위치</span>
                <span className="min-w-0 text-[15px] font-semibold text-[color:var(--lv-ink)] [word-break:keep-all]">{promotedParcel.label}</span>
              </div>
            )}
            {promotedDue && (
              <div className="flex items-baseline gap-3">
                <span className="w-[38px] shrink-0 text-[14px] font-semibold text-[color:var(--lv-ink-soft)]">마감</span>
                <span className={`min-w-0 text-[15px] font-semibold [word-break:keep-all] ${promotedDue.warn ? "text-[color:var(--lv-urgent)]" : "text-[color:var(--lv-ink)]"}`}>
                  {promotedDue.warn ? `마감 임박 · ${promotedDue.text}` : promotedDue.text}
                </span>
              </div>
            )}
          </div>
          {promotedGuide && (
            <p className="inline-flex items-start gap-1.5 text-[15px] font-medium leading-[1.5] text-[color:var(--lv-ink-soft)] [word-break:keep-all]">
              <Camera size={16} className="mt-0.5 shrink-0 text-[color:var(--lv-primary)]" /> {promotedGuide}
            </p>
          )}
          <div className="flex min-h-[64px] w-full items-center justify-center gap-2 rounded-[18px] bg-[var(--lv-primary)] text-[18px] font-bold text-white">
            <Camera size={20} /> {promotedLabel}
          </div>
        </button>
      )}

      {/* 오늘 할 일 N개 */}
      <div className="overflow-hidden rounded-[24px] bg-[var(--lv-card)] shadow-[0_2px_8px_rgba(23,35,27,0.05)]">
        <div className="flex items-center justify-between border-b border-[var(--lv-line-soft)] px-4 py-3.5">
          <h2 className="whitespace-nowrap text-[18px] font-bold text-[color:var(--lv-ink)]">{promoted ? "다른 할 일" : "오늘 할 일"} {listTodos.length}개</h2>
          <button onClick={() => navigate("journal")} className="min-h-[48px] px-2 text-[15px] font-semibold text-[color:var(--lv-primary)]">전체 보기 ›</button>
        </div>
        {listTodos.length === 0 ? (
          <p className="px-4 py-5 text-[16px] font-medium text-[color:var(--lv-ink-soft)]">{promoted ? "위 일을 끝내면 오늘 할 일은 끝이에요." : "지금 챙길 일은 없어요. 아래에서 오늘 한 일을 남겨보세요."}</p>
        ) : top.map((t, i) => {
          const due = stdDue(t.due_date);
          const tp = parcels.find((p) => p.parcel_no === t.parcel_no);
          const kind = kindOf(t);
          const rowLabel = kind === "receipt" ? "영수증 올리기" : kind === "certificate" ? "이수증 올리기" : "사진 찍기";
          return (
            <div key={`${t.todo_id}-${i}`} className={`flex items-center gap-3 px-4 py-3.5 ${i < top.length - 1 ? "border-b border-[var(--lv-line-soft)]" : ""}`}>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--lv-accent-soft)]"><JobIcon jobCd={t.job_cd} size={22} className="text-[color:var(--lv-primary)]" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-semibold leading-tight text-[color:var(--lv-ink)] [word-break:keep-all]">{t.job_name}</p>
                <p className="mt-1 text-[14px] font-medium text-[color:var(--lv-ink-soft)] [word-break:keep-all]">
                  {tp ? `${tp.label} · ` : ""}
                  {due.warn ? <span className="font-semibold text-[color:var(--lv-urgent)]">{`마감 임박 · ${due.short}`}</span> : due.short}
                </p>
              </div>
              <button onClick={() => { onTodoAction("photo", t); navigate("photoInput"); }}
                className="flex min-h-[56px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[14px] bg-[var(--lv-accent-soft)] px-4 text-[16px] font-bold text-[color:var(--lv-primary)]">
                {kind === "photo" ? <Camera size={20} /> : <FileText size={20} />}{rowLabel}
              </button>
            </div>
          );
        })}
      </div>

      {/* 오늘 한 일 남기기 — 단일 큰 카드. 안에서 마이크/메모/사진을 한 번에 처리 */}
      <button
        onClick={() => { onTodoAction("record", null); navigate("manualInput"); }}
        className="flex min-h-[96px] w-full items-center gap-4 rounded-[24px] bg-[var(--lv-card)] p-5 text-left shadow-[0_2px_8px_rgba(23,35,27,0.05)]"
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--lv-primary)] text-white">
          <PenLine size={28} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[19px] font-bold leading-tight text-[color:var(--lv-ink)] [word-break:keep-all]">오늘 한 일 기록하기</p>
          <p className="mt-1 text-[14px] font-semibold text-[color:var(--lv-ink-soft)] [word-break:keep-all]">말로 남기거나 직접 적을 수 있어요</p>
        </div>
        <ChevronRight size={22} className="shrink-0 text-[color:var(--lv-ink-soft)]" />
      </button>

      {/* 농사 도와주기 */}
      {helperRecipientName && (
        <button onClick={() => onToggleHelperMode?.(!helperModeOn)}
          className="flex min-h-[68px] w-full items-center gap-3.5 rounded-[24px] bg-[var(--lv-card)] px-5 py-4 text-left shadow-[0_2px_8px_rgba(23,35,27,0.05)]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--lv-accent-soft)]">
            <Users size={22} strokeWidth={2} className="text-[color:var(--lv-primary)]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="block text-[17px] font-semibold text-[color:var(--lv-ink)] [word-break:keep-all]">{helperRecipientName}님 기록 도와주러 가기</span>
              <span className="shrink-0 rounded-full bg-[var(--lv-accent-soft)] px-2.5 py-0.5 text-[14px] font-semibold text-[color:var(--lv-primary)]">도움 가능</span>
            </span>
            <span className="mt-px block text-[14px] font-semibold text-[color:var(--lv-ink-soft)]">서로 동의한 기록만 도와드려요</span>
          </span>
          <ChevronRight size={22} className="shrink-0 text-[color:var(--lv-ink-soft)]" />
        </button>
      )}
    </div>
  );
}

/* Claude Code: props 는 HomeScreen.tsx 와 동일 소스에서 주입.
   LocavilleApp 에서 isSimpleMode() 가 false 일 때 이 컴포넌트를,
   true 일 때 <HomeScreen simple /> 를 렌더하세요. 하단 탭은
   표준=홈·영농일지·사업·도움말(4), 쉬운=오늘·영농일지·도움말(3),
   설정은 두 모드 모두 상단 톱니로. */
