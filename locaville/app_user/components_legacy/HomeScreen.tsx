"use client";

/** 홈 화면 — 오늘의 할 일 목록 (`/todo/today`) + 빠른 액션 버튼들. 농가가 앱 열자마자 보는 첫 화면. */

import { useEffect, useMemo, useState } from "react";
import { Mic, Camera, PenLine, Repeat, HeartHandshake, ChevronRight, Sparkles } from "lucide-react";
import {
  TodoIllustration,
  pickTodoIllustration,
  pickTodoEvidenceKind,
  TODO_EVIDENCE_LABEL,
} from "./TodoIllustration";
import { fetchTodayAdvice, type Advice } from "@/lib/advice-service";
import { SAMPLE_USER_CONTEXT } from "@/lib/sample-user-context";
import { useHelperMode } from "@/lib/helper-mode-context";
import { getTodayTodos, type TodoItemApi } from "@/lib/todo-service";
import { buildTodoActionMessage } from "@/lib/todo-display";
import { listEvidenceRecords } from "@/lib/evidence-service";
import type { EvidenceRecord } from "@/lib/evidence-types";
import type { FarmHelperPair } from "@/lib/farm-helper-service";
import { isSimpleMode, onPreferencesChanged } from "@/lib/preferences";
import { TodoAlertSkeleton } from "./TodoSkeleton";
import TodoPhotoGuideModal from "./TodoPhotoGuideModal";

type Screen =
  | "home"
  | "voiceInput"
  | "manualInput"
  | "photoInput"
  | "saveComplete"
  | "journal"
  | "business"
  | "help"
  | "settings"
  | "journalDetail"
  | "businessDetail"
  | "splash"
  | "loginSelect"
  | "manualLogin";

interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

interface HomeScreenProps {
  selectedDate: Date;
  todoItems: TodoItem[];
  setTodoItems: (items: TodoItem[]) => void;
  missingPhotoCount: number;
  navigate: (screen: Screen) => void;
  onTodoAction?: (action: "record" | "photo", todo: TodoItemApi | null) => void;
  /** 기록 도우미 — 본인 역할. */
  helperRole?: "helper" | "recipient" | "none";
  helperPair?: FarmHelperPair | null;
  /** helper 가 "도와주러 가기" 활성 상태인지. */
  helperModeOn?: boolean;
  onToggleHelperMode?: (on: boolean) => void;
  /** 동의 모달 다시 열기. */
  onOpenConsent?: () => void;
}

function formatDateSimple(d: Date): string {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
}

function getStatusKey(todo: TodoItemApi) {
  return (todo.computed_status || todo.status || "pending").toLowerCase();
}

// `buildTodoActionMessage` 가 폰 화면용 두 줄 문장({primary, sub}) 을 반환.
// JournalScreen 과 공유 — 정의는 lib/todo-display.ts.

// 오른쪽에 표시할 마감 라벨 — "X월 Y일까지" (1줄) + "해야해요!" (suffix) 친근 어조.
// suffix 가 빈 문자열인 경우는 라벨 단독 (예: "기한 지났어요!", "기한 미정").
function getDueShort(todo: TodoItemApi): {
  text: string;
  suffix: string;
  level: "past" | "today" | "future" | "none";
  daysUntil?: number;
} {
  if (!todo.due_date) return { text: "기한 미정", suffix: "", level: "none" };
  const due = new Date(`${todo.due_date}T00:00:00`);
  if (Number.isNaN(due.getTime())) return { text: "기한 확인", suffix: "", level: "none" };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { text: "기한 지났어요!", suffix: "", level: "past", daysUntil: diff };
  if (diff === 0) return { text: "오늘까지", suffix: "해야해요!", level: "today", daysUntil: 0 };
  return {
    text: `${due.getMonth() + 1}월 ${due.getDate()}일까지`,
    suffix: "해야해요!",
    level: "future",
    daysUntil: diff,
  };
}

// 마감 라벨 색 — 임박도 기반. 늑대소년 효과 방지 — 멀면 ink 검정, 가까우면 warn/danger.
//   past/today  → danger (빨강)
//   d-3 이내   → danger (빨강)
//   d-7 이내   → warn (주황)
//   그 외 future → ink (검정, 평범한 정보)
function dueColor(level: "past" | "today" | "future" | "none", daysUntil?: number): string {
  if (level === "past") return "var(--danger)";
  if (level === "today") return "var(--danger)";
  if (level === "future") {
    if (daysUntil != null && daysUntil <= 3) return "var(--danger)";
    if (daysUntil != null && daysUntil <= 7) return "var(--warn)";
    return "var(--ink)";
  }
  return "var(--ink-soft)";
}

export default function HomeScreen({
  selectedDate,
  navigate,
  onTodoAction,
  helperRole = "none",
  helperPair = null,
  helperModeOn = false,
  onToggleHelperMode,
  onOpenConsent,
}: HomeScreenProps) {
  // 도움 모드 ON 이면 effectiveFarmerId = recipient 의 amo_regno → todo/evidence 가 그분 기준으로 fetch.
  const { effectiveFarmerId } = useHelperMode();
  // helper 가 다른 농가의 기록을 도와드리는 중 — 이때는 본인 농장의 날씨/배경 정보를 숨겨
  // recipient 의 기록 작업에만 집중하게 한다. (헤더/탭바는 LocavilleApp 에서 숨김 처리.)
  const helperModeActive = helperRole === "helper" && helperModeOn && helperPair?.is_active === true;
  const [apiTodos, setApiTodos] = useState<TodoItemApi[]>([]);
  const [loadingTodos, setLoadingTodos] = useState(true);
  // 이장님이 PATCH 로 status=retake_required 로 바꾼 농가 본인 증빙 사진들.
  // 농가가 앱 열면 "재촬영 요청이 있어요" 알림으로 보여줌.
  const [retakeEvidences, setRetakeEvidences] = useState<EvidenceRecord[]>([]);
  // 오늘의 한마디 (advice 캐시) — 매칭 시나리오 있을 때만 노출.
  const [advice, setAdvice] = useState<Advice | null>(null);
  // todo 카드 누르면 뜨는 사진 가이드 팝업 — "이런 사진을 찍어주세요" 안내 후 photoInput 으로.
  const [guideTodo, setGuideTodo] = useState<TodoItemApi | null>(null);
  // "간단하게 보기" 모드 — ON 시 부가 카드 숨기고 핵심만 + inline fontSize 자동 확대.
  // mount 시 + preferences-changed 이벤트마다 갱신 (설정 화면에서 토글 시 즉시 반영).
  const [simpleMode, setSimpleModeState] = useState(false);
  useEffect(() => {
    const update = () => setSimpleModeState(isSimpleMode());
    update();
    return onPreferencesChanged(update);
  }, []);

  // inline fontSize 확대 helper — globals.css 의 data-large-text selector 가 inline style 의
  // px 고정값에는 효과 없어서 직접 곱셈. 1.55배 = 다른 화면들의 xlarge 비율과 동일.
  const fs = (n: number): number => (simpleMode ? Math.round(n * 1.55) : n);

  useEffect(() => {
    let mounted = true;
    setLoadingTodos(true);
    void getTodayTodos({ farmer_id: effectiveFarmerId })
      .then((items) => {
        if (mounted) setApiTodos(items);
      })
      .catch(() => {
        if (mounted) setApiTodos([]);
      })
      .finally(() => {
        if (mounted) setLoadingTodos(false);
      });
    return () => {
      mounted = false;
    };
  }, [selectedDate, effectiveFarmerId]);

  // 농가 본인 증빙 중 이장님이 재촬영 요청한 건만 fetch — 알림 영역에 표시.
  // 실패해도 화면 안 깨짐 (silent).
  useEffect(() => {
    let mounted = true;
    void listEvidenceRecords({ farmer_id: effectiveFarmerId })
      .then((records) => {
        if (!mounted) return;
        const retakes = records.filter((r) => r.status === "retake_required");
        setRetakeEvidences(retakes);
      })
      .catch(() => {
        if (mounted) setRetakeEvidences([]);
      });
    return () => {
      mounted = false;
    };
  }, [effectiveFarmerId]);

  // 미완료 todo 를 마감 임박 순으로 정렬한 뒤, 같은 활동(activity_id 또는 job_cd) 은
  // 가장 임박한 1건만 남기고 중복 제거. 같은 작업이 여러 시기에 반복 등록돼도 농가는
  // 가장 가까운 한 번만 보면 충분.
  const urgentTodos = useMemo(() => {
    const compareByDue = (a: TodoItemApi, b: TodoItemApi) =>
      (a.due_date || "9999-12-31").localeCompare(b.due_date || "9999-12-31");
    const candidates = apiTodos
      .filter((t) => getStatusKey(t) !== "completed")
      .sort(compareByDue);
    const seen = new Set<string>();
    const out: TodoItemApi[] = [];
    for (const t of candidates) {
      const key = (t.activity_id || t.job_cd || t.job_name || t.activity_name || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    // 한 화면 = 가장 급한 1건 (todo 카드 안에 음성/사진 CTA 가 같이 들어가서 카드가 큼).
    return out.slice(0, 1);
  }, [apiTodos]);

  // 오늘의 한마디 — backend 캐시. 없으면 null (카드 미노출).
  useEffect(() => {
    let mounted = true;
    void fetchTodayAdvice(effectiveFarmerId).then((a) => {
      if (mounted) setAdvice(a);
    });
    return () => {
      mounted = false;
    };
  }, [effectiveFarmerId]);

  // chip "오늘 할 일 N건" 의 N — 미완료 todo 전체 개수. 카드는 1건만 보이지만
  // 사용자가 남은 작업이 더 있는지 한눈에 인지하도록 chip 으로 노출.
  const pendingTodoCount = useMemo(
    () => apiTodos.filter((t) => getStatusKey(t) !== "completed").length,
    [apiTodos],
  );

  return (
    // 농가 홈 — 부모(LocavilleApp) content area 가 overflow-y-auto 라 자연 스크롤.
    // 콘텐츠 (todo 카드 + 자유 기록 + helper) 가 많아도 스크롤로 처리 — 한 화면 fit 강제 X.
    <div
      className="flex flex-col gap-5 pb-10 farmer-stagger"
      style={{ background: "transparent", minHeight: "100%" }}
    >
      {/* 오늘의 한마디 — 박스/chip 없이 본문만 평문으로. agent 가 말 거는 톤.
          좌측 작은 ✦ 아이콘이 시스템 메시지임을 살짝 시그널.
          간단하게 보기 ON 시 인지 부담 줄이기 위해 숨김. */}
      {!simpleMode && advice && advice.content && (
        <div className="px-4" style={{ paddingTop: 12, paddingBottom: 4 }}>
          <p
            className="break-keep flex items-start"
            style={{
              color: "var(--ink)",
              fontSize: fs(17),
              fontWeight: 700,
              letterSpacing: "-0.01em",
              lineHeight: 1.65,
              gap: 10,
            }}
          >
            <Sparkles
              className="w-4 h-4 flex-shrink-0"
              style={{ color: "var(--primary)", marginTop: 7 }}
            />
            <span style={{ whiteSpace: "pre-line" }}>
              {advice.content.replace(/([.!?])\s+/g, "$1\n")}
            </span>
          </p>
        </div>
      )}

      {/* 재촬영 요청 알림 — 이장님이 사진 검토하고 다시 찍어 달라고 한 건. todo 보다 위쪽 우선.
          (일반 알림 띠는 제거 — 헤더 종의 큰 배지가 대체. 재촬영은 즉시 행동 필요해 카드 유지.)
          카드 패턴: 좌측 strip 제거 → 상단 chip 으로 분류. */}
      {retakeEvidences.length > 0 && (
        <div className="px-4">
          <button
            type="button"
            onClick={() => {
              onTodoAction?.("photo", null);
              navigate("photoInput");
            }}
            className="w-full px-5 py-5 flex flex-col gap-3 text-left rounded-3xl active:opacity-95"
            style={{
              background: "#ffffff",
              boxShadow: "0 1px 2px rgba(31, 42, 31, 0.04), 0 10px 24px rgba(31, 42, 31, 0.05)",
            }}
          >
            {/* 상단 chip — "다시 찍어주세요" 카테고리 라벨 */}
            <span
              className="inline-flex items-center gap-1.5 self-start"
              style={{
                background: "var(--danger-soft)",
                color: "var(--danger)",
                fontSize: fs(13),
                fontWeight: 800,
                padding: "4px 10px",
                borderRadius: 999,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--danger)" }} />
              다시 찍어주세요
            </span>
            {/* 본문 stack */}
            <div className="flex items-start gap-3">
              <div
                className="flex-shrink-0 flex items-center justify-center"
                style={{
                  background: "var(--danger-soft)",
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                }}
              >
                <Repeat className="w-5 h-5" style={{ color: "var(--danger)" }} />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <p className="font-extrabold leading-tight break-keep" style={{ color: "var(--ink)", fontSize: fs(17), letterSpacing: "-0.02em" }}>
                  이장님이 사진을 다시 찍어 달라고 했어요
                </p>
                <p className="leading-snug break-keep" style={{ color: "var(--ink-soft)", fontWeight: 500, fontSize: fs(15) }}>
                  {retakeEvidences[0].user_message || "사진을 다시 찍어 올려 주세요."}
                </p>
                {retakeEvidences.length > 1 && (
                  <p className="text-xs font-bold leading-tight mt-0.5" style={{ color: "var(--danger)" }}>
                    외 {retakeEvidences.length - 1}건 더
                  </p>
                )}
              </div>
            </div>
          </button>
        </div>
      )}

      {/* 로딩 중: skeleton 1개로 "곧 옵니다" 느낌. 데이터 도착 후 실제 todo 카드. */}
      {loadingTodos && (
        <div className="px-4">
          <TodoAlertSkeleton count={1} />
        </div>
      )}

      {/* todo 가 없는 날 — 빈 상태 카드. 짧은 안내만, CTA 는 아래 "다른 일도 기록하기" 섹션에. */}
      {!loadingTodos && urgentTodos.length === 0 && (
        <div className="px-4">
          <div
            className="w-full px-5 py-5 flex flex-col gap-2 rounded-3xl"
            style={{
              background: "#ffffff",
              border: "1px solid rgba(47, 109, 79, 0.14)",
              boxShadow: "0 2px 6px rgba(31, 42, 31, 0.05), 0 16px 36px rgba(47, 109, 79, 0.08)",
            }}
          >
            <span
              className="inline-flex items-center gap-1.5 self-start"
              style={{
                background: "var(--accent-soft, #e3f0e6)",
                color: "var(--primary)",
                fontSize: fs(13),
                fontWeight: 800,
                padding: "4px 10px",
                borderRadius: 999,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)" }} />
              오늘 할 일
            </span>
            <p className="font-extrabold leading-tight" style={{ color: "var(--ink)", fontSize: fs(20), letterSpacing: "-0.025em" }}>
              오늘 꼭 해야 할 일은 없어요
            </p>
            <p className="leading-snug" style={{ color: "var(--ink-soft)", fontSize: fs(15), fontWeight: 500 }}>
              그래도 농사하셨다면 아래에 남겨두세요.
            </p>
          </div>
        </div>
      )}

      {!loadingTodos && urgentTodos.length > 0 && (
        <div className="px-4 flex flex-col gap-3">
          {urgentTodos.map((todo) => {
            const due = getDueShort(todo);
            const needPhoto = (todo.required_evidence_types?.length ?? 0) > 0;
            const evidenceKind = pickTodoEvidenceKind(todo.required_evidence_types);
            const evidenceLabel = TODO_EVIDENCE_LABEL[evidenceKind];
            const illustration = pickTodoIllustration({
              needPhoto,
              jobName: todo.job_name,
              activityName: todo.activity_name,
              jobCd: todo.job_cd,
              requiredEvidenceTypes: todo.required_evidence_types,
            });
            const dueLine = due.suffix ? `${due.text} ${due.suffix}` : due.text;
            const msg = buildTodoActionMessage(todo);
            // 마감 임박도에 따라 chip + 일러스트 배경 톤.
            const isPast = due.level === "past";
            const accent = isPast ? "var(--danger)" : "var(--warn)";
            const accentSoft = isPast ? "var(--danger-soft)" : "var(--warn-soft)";
            return (
              <div
                key={todo.todo_id}
                className="w-full px-5 py-5 flex flex-col gap-4 rounded-3xl"
                style={{
                  background: "#ffffff",
                  border: "1px solid rgba(47, 109, 79, 0.14)",
                  boxShadow: "0 2px 6px rgba(31, 42, 31, 0.05), 0 16px 36px rgba(47, 109, 79, 0.08)",
                }}
              >
                {/* 카드 본문 — 영역 전체 클릭 시 사진 가이드 모달. */}
                <button
                  type="button"
                  onClick={() => setGuideTodo(todo)}
                  className="flex flex-col gap-2.5 text-left active:opacity-95"
                  style={{ background: "transparent", border: "none", padding: 0 }}
                >
                  {/* 상단 chip 줄 — 좌측 "오늘 할 일" chip, 우측 "다른 할 일 N건 ›" 사이드 라벨.
                     chip 과 남은 작업 카운트가 짝지어져서 의미 명확. */}
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span
                      className="inline-flex items-center gap-1.5"
                      style={{
                        background: accentSoft,
                        color: accent,
                        fontSize: fs(13),
                        fontWeight: 800,
                        padding: "4px 10px",
                        borderRadius: 999,
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
                      오늘 할 일
                    </span>
                    {pendingTodoCount > 1 && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate("journal");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate("journal");
                          }
                        }}
                        style={{
                          color: "var(--ink-soft)",
                          fontSize: fs(13),
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {pendingTodoCount - 1}건 더 보기 ›
                      </span>
                    )}
                  </div>
                  {/* 본문 — 손그림 일러스트 + 텍스트. squircle 배경 제거: 일러스트 자체에 색이
                     있어 박스가 시각 무게만 추가. 일러스트는 자연스럽게 떠 있게. */}
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0" style={{ width: 44, height: 44 }}>
                      <TodoIllustration kind={illustration} size={44} />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      {/* 작업 제목 — 가장 큰 글씨 */}
                      <p
                        className="font-extrabold leading-tight break-keep"
                        style={{ color: "var(--ink)", fontSize: fs(22), letterSpacing: "-0.025em" }}
                      >
                        {msg.primary}
                      </p>
                      {/* 마감 — 임박도 기반 색. d-7 이상은 ink 검정 (늑대소년 효과 방지).
                         flex 대신 inline 으로 둬서 글씨 커진 simple mode 에서 자연 wrap. */}
                      <p
                        className="font-extrabold leading-snug break-keep"
                        style={{ color: dueColor(due.level, due.daysUntil), fontSize: fs(16) }}
                      >
                        <span style={{ fontSize: fs(14), marginRight: 4 }}>⚠️</span>
                        {dueLine}
                      </p>
                    </div>
                  </div>
                </button>

                {/* 메인 CTA — 이 todo 와 연결된 사진 증빙 등록 (PhotoGuardOverlay 자동 노출).
                   todo 의 완료 조건은 "사진 증빙" 이라 사진이 메인 행동. 말로/직접 입력은
                   카드 밖 "다른 일도 기록하기" 섹션으로 분리. */}
                <button
                  type="button"
                  onClick={() => {
                    onTodoAction?.("photo", todo);
                    navigate("photoInput");
                  }}
                  className="w-full flex items-center justify-center gap-2.5 rounded-2xl active:opacity-95 active:translate-y-px transition-transform"
                  style={{
                    background: "var(--primary)",
                    color: "#fff",
                    minHeight: 68,
                    padding: "20px 20px",
                    fontSize: fs(22),
                    fontWeight: 800,
                    letterSpacing: "-0.01em",
                    marginTop: 8,
                    boxShadow: "0 6px 16px rgba(47, 109, 79, 0.22)",
                  }}
                >
                  <Camera className="w-7 h-7" />
                  {evidenceLabel.ctaText}
                </button>

                {/* 보조 안내 — 증빙 타입별 행동 중심 문구. */}
                <p
                  className="text-center"
                  style={{
                    color: "var(--ink-soft)",
                    fontSize: fs(14),
                    fontWeight: 600,
                    lineHeight: 1.5,
                    marginTop: 4,
                  }}
                >
                  {evidenceLabel.subText}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* 오늘 있었던 일도 남겨두세요 — todo 와 무관한 자유 기록.
         todo 카드의 사진 버튼이 1순위 (primary fill). 여기는 2순위 — accent-soft fill 로
         같은 family 안에서 시각 위계 명확히 (색 family 같으면 어느 게 1순위인지 헷갈림).
         간단하게 보기 ON 시 음성 버튼만 남기고 "손으로 적기" 부가 옵션은 숨김. */}
      <div className="px-4">
        <p
          style={{
            color: "var(--muted-2, #8a8e7e)",
            fontSize: fs(13),
            fontWeight: 600,
            paddingLeft: 4,
            marginBottom: 14,
            letterSpacing: "0.01em",
            lineHeight: 1.4,
          }}
        >
          오늘 있었던 일도 남겨두세요
        </p>
        <div className="flex flex-col" style={{ gap: 12 }}>
          <button
            type="button"
            onClick={() => {
              onTodoAction?.("record", null);
              navigate("voiceInput");
            }}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl active:opacity-95 active:translate-y-px transition-transform"
            style={{
              background: "var(--accent-soft, #e3f0e6)",
              color: "var(--primary)",
              minHeight: 60,
              padding: "18px",
              fontSize: fs(17),
              fontWeight: 800,
              letterSpacing: "-0.01em",
              border: "1px solid rgba(47, 109, 79, 0.18)",
            }}
          >
            <Mic className="w-5 h-5" />
            말로 남기기
          </button>
          {!simpleMode && (
            <button
              type="button"
              onClick={() => {
                onTodoAction?.("record", null);
                navigate("manualInput");
              }}
              className="w-full flex items-center justify-center gap-2 active:opacity-70"
              style={{
                background: "transparent",
                color: "var(--ink-soft)",
                minHeight: 52,
                padding: "14px",
                fontSize: fs(15),
                fontWeight: 700,
                border: "none",
              }}
            >
              <PenLine className="w-4 h-4" />
              손으로 직접 적기
            </button>
          )}
        </div>
      </div>

      {/* 기록 도우미 안내 / 액션 — role 별 카드. 자유 기록 섹션 아래로 배치.
          매일 쓰는 기능 아니라 우선순위 낮춤. helper 모드가 활성이면 상단 띠가 같은 정보를
          전달하므로 카드는 숨겨서 화면을 정리. 카드 패턴: 상단 chip → 본문. 좌측 strip 없음. */}
      {helperPair && helperRole === "helper" && !helperModeActive && (
        <div className="px-4">
          {!helperPair.helper_approved_at ? (
            <button
              type="button"
              onClick={() => onOpenConsent?.()}
              className="w-full px-5 py-5 flex flex-col gap-3 text-left rounded-3xl active:opacity-95"
              style={{
                background: "#ffffff",
                boxShadow: "0 1px 2px rgba(31, 42, 31, 0.04), 0 10px 24px rgba(31, 42, 31, 0.05)",
              }}
            >
              <span
                className="inline-flex items-center gap-1.5 self-start"
                style={{ background: "rgba(47,109,79,0.10)", color: "var(--primary)", fontSize: fs(13), fontWeight: 800, padding: "4px 10px", borderRadius: 999 }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)" }} />
                🤝 농사 도와주기
              </span>
              <div className="flex items-center justify-between gap-2 w-full">
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="font-extrabold leading-tight" style={{ color: "var(--ink)", fontSize: fs(17), letterSpacing: "-0.02em" }}>
                    {helperPair.recipient_name || "다른 농가"}님의 기록 도와주기
                  </p>
                  <p className="leading-snug" style={{ color: "var(--ink-soft)", fontWeight: 500, fontSize: fs(15) }}>
                    눌러서 동의하기
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: "var(--ink-soft)" }} />
              </div>
            </button>
          ) : helperPair.is_active ? (
            <button
              type="button"
              onClick={() => onToggleHelperMode?.(!helperModeOn)}
              className="w-full px-5 py-5 flex flex-col gap-3 text-left rounded-3xl active:opacity-95"
              style={{
                background: helperModeOn ? "var(--primary)" : "#ffffff",
                color: helperModeOn ? "#fff" : "var(--ink)",
                boxShadow: "0 1px 2px rgba(31, 42, 31, 0.04), 0 10px 24px rgba(31, 42, 31, 0.05)",
              }}
            >
              <span
                className="inline-flex items-center gap-1.5 self-start"
                style={{
                  background: helperModeOn ? "rgba(255,255,255,0.20)" : "rgba(47,109,79,0.10)",
                  color: helperModeOn ? "#fff" : "var(--primary)",
                  fontSize: fs(13),
                  fontWeight: 800,
                  padding: "4px 10px",
                  borderRadius: 999,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: helperModeOn ? "#fff" : "var(--primary)" }} />
                🤝 농사 도와주기
              </span>
              <div className="flex items-center justify-between gap-2 w-full">
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="font-extrabold leading-tight" style={{ fontSize: fs(17), letterSpacing: "-0.02em" }}>
                    {helperModeOn
                      ? `${helperPair.recipient_name || "농가"}님 기록 도와주는 중`
                      : `${helperPair.recipient_name || "농가"}님 기록 도와주러 가기`}
                  </p>
                  <p
                    className="leading-snug"
                    style={{ color: helperModeOn ? "rgba(255,255,255,0.92)" : "var(--ink-soft)", fontWeight: 500, fontSize: fs(15) }}
                  >
                    {helperModeOn
                      ? "다시 누르면 종료돼요"
                      : `${helperPair.recipient_name || "농가"}님 농가로 이동`}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: helperModeOn ? "rgba(255,255,255,0.85)" : "var(--ink-soft)" }} />
              </div>
            </button>
          ) : (
            <div
              className="w-full px-5 py-4 flex items-center gap-3 rounded-3xl"
              style={{ background: "rgba(94,99,86,0.06)" }}
            >
              <HeartHandshake className="w-5 h-5" style={{ color: "var(--ink-soft)" }} />
              <p className="text-sm leading-snug" style={{ color: "var(--ink-soft)", fontWeight: 500 }}>
                {helperPair.recipient_name || "농가"}님이 동의해 주시면 도와드릴 수 있어요.
              </p>
            </div>
          )}
        </div>
      )}

      {helperPair && helperRole === "recipient" && (
        <div className="px-4">
          {!helperPair.recipient_approved_at ? (
            <button
              type="button"
              onClick={() => onOpenConsent?.()}
              className="w-full px-5 py-5 flex flex-col gap-3 text-left rounded-3xl active:opacity-95"
              style={{
                background: "#ffffff",
                boxShadow: "0 1px 2px rgba(31, 42, 31, 0.04), 0 10px 24px rgba(31, 42, 31, 0.05)",
              }}
            >
              <span
                className="inline-flex items-center gap-1.5 self-start"
                style={{ background: "rgba(47,109,79,0.10)", color: "var(--primary)", fontSize: fs(13), fontWeight: 800, padding: "4px 10px", borderRadius: 999 }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)" }} />
                🤝 도움 받기
              </span>
              <div className="flex items-center justify-between gap-2 w-full">
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="font-extrabold leading-tight" style={{ color: "var(--ink)", fontSize: fs(17), letterSpacing: "-0.02em" }}>
                    {helperPair.helper_name || "다른 분"}님이 기록을 도와드린대요
                  </p>
                  <p className="leading-snug" style={{ color: "var(--ink-soft)", fontWeight: 500, fontSize: fs(15) }}>
                    눌러서 동의하기
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: "var(--ink-soft)" }} />
              </div>
            </button>
          ) : helperPair.is_active ? (
            <div
              className="w-full px-5 py-3 flex items-center gap-2.5 rounded-3xl"
              style={{ background: "rgba(47,109,79,0.08)" }}
            >
              <HeartHandshake className="w-4 h-4" style={{ color: "var(--primary)" }} />
              <p className="leading-snug" style={{ color: "var(--ink)", fontWeight: 600, fontSize: fs(15) }}>
                지금 {helperPair.helper_name || "도우미"}님이 기록을 도와드리고 계세요.
              </p>
            </div>
          ) : null}
        </div>
      )}


      {/* todo 카드 누르면 뜨는 사진 가이드 팝업 — 정보 안내만, 액션은 음성/사진 버튼에서 */}
      <TodoPhotoGuideModal
        open={!!guideTodo}
        todo={guideTodo}
        onClose={() => setGuideTodo(null)}
      />
    </div>
  );
}
