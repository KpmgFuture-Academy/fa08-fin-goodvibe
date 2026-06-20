"use client";

/**
 * v0_farmer 의 최상위 앱 컴포넌트.
 *
 * 단일 페이지(SPA)에서 화면 상태(`screen` enum)로 다른 컴포넌트를 전환. Next.js 라우팅
 * 대신 메모리 상태로 화면을 관리 — 농가용 모바일 앱 단순성을 위함. 화면 목록:
 *   splash / loginSelect / manualLogin / home / journal / journalDetail / business /
 *   businessDetail / voiceInput / photoInput / manualInput / saveComplete / help / settings
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PenLine, NotebookText, Leaf, HelpCircle, Settings, Bell } from "lucide-react";
import { listDiaryRecords } from "@/lib/diary-service";
import type { DiaryRecord, InputMethod, ManualDiaryInput } from "@/lib/diary-types";
import { fetchFarmerParcels, primeFarmerParcels } from "@/lib/parcel-service";
import { fetchFarmerUnreadCount } from "@/lib/notification-service";
import {
  approveHelperPair,
  fetchCurrentHelperRole,
  type FarmHelperPair,
} from "@/lib/farm-helper-service";
import { HelperModeProvider } from "@/lib/helper-mode-context";
import { SAMPLE_USER_CONTEXT, hasSampleLogin } from "@/lib/sample-user-context";
import { NotificationPanel } from "./NotificationPanel";
import { HelperConsentModal } from "./HelperConsentModal";
import {
  NotificationActionPromptModal,
  type NotificationActionKind,
} from "./NotificationActionPromptModal";
import { HelperModeTransitionScreen } from "./HelperModeTransitionScreen";
import { HomeLoadingScreen } from "./HomeLoadingScreen";
import { WeatherWidget } from "./WeatherWidget";
import TermsAgreementModal from "./TermsAgreementModal";
import {
  applyFontScaleToBody,
  getFontScale,
  hasAgreedToTerms,
  isInNotifWindow,
  isSimpleMode,
  onPreferencesChanged,
} from "@/lib/preferences";

import HomeScreen from "./HomeScreen";
import VoiceInputScreen from "./VoiceInputScreen";
import ManualInputScreen from "./ManualInputScreen";
import PhotoInputScreen from "./PhotoInputScreen";
import SaveCompleteScreen from "./SaveCompleteScreen";
import JournalScreen from "./JournalScreen";
import JournalDetailScreen from "./JournalDetailScreen";
import BusinessScreen from "./BusinessScreen";
import BusinessDetailScreen from "./BusinessDetailScreen";
import HelpScreen from "./HelpScreen";
import SettingsScreen from "./SettingsScreen";
import SplashScreen from "./SplashScreen";
import LoginSelectScreen from "./LoginSelectScreen";
import ManualLoginScreen from "./ManualLoginScreen";
import type { Business } from "./BusinessScreen";
import type { EvidenceRecord } from "@/lib/evidence-types";
import type { TodoItemApi } from "@/lib/todo-service";

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

type Tab = "home" | "journal" | "business" | "help" | "settings";

interface SavedRecord {
  date: string;
  work: string;
  field: string;
  amount: string;
  business: string;
  hasPhoto: boolean;
  memo?: string;
  inputMethod: InputMethod;
}

interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

const INITIAL_TODOS: TodoItem[] = [
  { id: 1, text: "물 상태 확인하기", done: false },
  { id: 2, text: "비료 사용 여부 기록하기", done: false },
  { id: 3, text: "작업 사진 1장 올리기", done: true },
];

// 시각 순서 — 왼쪽 2개, 가운데(홈=기록 진입점, 큰 FAB 원), 오른쪽 2개. NAV_ITEMS[2] = 가운데.
// 가운데 라벨이 "기록" 인 이유 — 홈 화면 자체가 advice + todo + 자유 기록 의 진입점이라
// 사용자 mental model 상 "홈" 보다 "기록" 이 의미 명확. screen key 는 그대로 "home" 유지.
const NAV_ITEMS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: "journal", label: "영농일지", icon: <NotebookText className="w-6 h-6" /> },
  { key: "business", label: "참여 사업", icon: <Leaf className="w-6 h-6" /> },
  { key: "home", label: "기록", icon: <PenLine className="w-7 h-7" /> },
  { key: "help", label: "도움말", icon: <HelpCircle className="w-6 h-6" /> },
  { key: "settings", label: "설정", icon: <Settings className="w-6 h-6" /> },
];
const CENTER_NAV_INDEX = 2;

const HIDE_NAV: Screen[] = ["voiceInput", "manualInput", "photoInput", "saveComplete", "splash", "loginSelect", "manualLogin"];
// 입력/스플래시/로그인 화면에서는 상단 헤더(로고+알림)도 숨김 — nav 와 동일 정책.
const HIDE_HEADER: Screen[] = HIDE_NAV;

export default function LocavilleApp() {
  const contentScrollRef = useRef<HTMLDivElement>(null);
  // 초기값 lazy initializer — sessionStorage skip-splash flag 또는 hasSampleLogin true 면
  // splash 건너뛰고 바로 home. (이 컴포넌트는 page.tsx 에서 ssr:false dynamic import 라 안전.)
  const [currentScreen, setCurrentScreen] = useState<Screen>(() => {
    if (typeof window === "undefined") return "splash";
    if (window.sessionStorage.getItem("locaville:skip-splash") === "1") {
      window.sessionStorage.removeItem("locaville:skip-splash");
      return "home";
    }
    if (hasSampleLogin()) return "home";
    return "splash";
  });
  const [selectedTab, setSelectedTab] = useState<Tab>("home");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [inputMethod, setInputMethod] = useState<InputMethod>("voice");
  const [savedRecord, setSavedRecord] = useState<SavedRecord | null>(null);
  const [todoItems, setTodoItems] = useState<TodoItem[]>(INITIAL_TODOS);
  const [uploadedPhoto, setUploadedPhoto] = useState(false);
  const [recentUploadedEvidence, setRecentUploadedEvidence] = useState<EvidenceRecord | null>(null);
  const [diaryRecords, setDiaryRecords] = useState<DiaryRecord[]>([]);
  const [selectedJournalRecord, setSelectedJournalRecord] = useState<DiaryRecord | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [selectedTodo, setSelectedTodo] = useState<TodoItemApi | null>(null);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // 첫 진입 시 약관 동의 모달 (localStorage.tos_agreed_v1 없으면 true). hydration 안전 위해
  // mount 후 effect 에서 결정.
  const [termsOpen, setTermsOpen] = useState(false);
  // 간단하게 보기 — 상단 헤더 + 하단 NavigationBar 의 inline fontSize 도 같이 확대.
  const [simpleMode, setSimpleModeState] = useState(false);
  useEffect(() => {
    const update = () => setSimpleModeState(isSimpleMode());
    update();
    return onPreferencesChanged(update);
  }, []);
  const fs = (n: number): number => (simpleMode ? Math.round(n * 1.55) : n);
  // 알림 클릭 시 종류별로 띄우는 confirm 모달 (사진 / 음성으로 이동).
  const [actionPrompt, setActionPrompt] = useState<NotificationActionKind | null>(null);

  // 기록 도우미 — 본인 역할 (helper / recipient / none) + 현재 활성 pair.
  const [helperRole, setHelperRole] = useState<"helper" | "recipient" | "none">("none");
  const [helperPair, setHelperPair] = useState<FarmHelperPair | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  // helper 가 "도와주러 가기" 모드 켰는지. 켜져 있으면 헤더에 띠 + 후속 기록 시 recipient 가 대상.
  const [helperModeOn, setHelperModeOn] = useState(false);
  // 도우미 모드 전환 인터스티셜 — 2.5초간 풀스크린 기차 애니메이션.
  //   "enter" : 다른 농가로 도와드리러 가는 중 (좌→우)
  //   "leave" : 내 농장으로 돌아오는 중 (우→좌)
  const [helperTransitioning, setHelperTransitioning] = useState<"enter" | "leave" | null>(null);

  // 홈 진입 로딩 트랜지션 — LocavilleApp mount 시마다 노출 (새로고침 = 다시 시작 = 로딩 환영).
  // 탭 전환은 keep-alive 라 LocavilleApp unmount 안 됨 → 영향 없음.
  // 2.2초 후 자동 fade-out (CSS animation 과 동일 시간).
  const [homeLoading, setHomeLoading] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasSampleLogin()) return;
    setHomeLoading(true);
    const t = window.setTimeout(() => setHomeLoading(false), 2200);
    return () => window.clearTimeout(t);
  }, []);

  // 화면 캐시 — 한 번 방문한 화면은 mount 유지, display 만 toggle. fetch 재실행 안 됨.
  // home/journal/business/help/settings 5개만 — 입력/스플래시/로그인은 단발성이라 제외.
  const KEEP_ALIVE: Screen[] = ["home", "journal", "business", "help", "settings"];
  const [mountedScreens, setMountedScreens] = useState<Set<Screen>>(new Set(["splash"]));
  useEffect(() => {
    setMountedScreens((prev) => {
      if (prev.has(currentScreen)) return prev;
      const next = new Set(prev);
      next.add(currentScreen);
      return next;
    });
  }, [currentScreen]);

  // splash 화면 자동 이동 — 2초 후 home(로그인 됨) 또는 loginSelect.
  // SplashScreen 자체 setTimeout 은 navigate dep 가 re-render 마다 바뀌어 cleanup 무한 반복
  // 되는 버그가 있어 부모(LocavilleApp) 에서 처리. 한 번만 실행.
  useEffect(() => {
    if (currentScreen !== "splash") return;
    const t = window.setTimeout(() => {
      setCurrentScreen(hasSampleLogin() ? "home" : "loginSelect");
    }, 2000);
    return () => window.clearTimeout(t);
  }, [currentScreen]);

  // helper "도와주러 가기" 토글 — ON/OFF 모두 인터스티셜 2.5초 노출 후 모드 적용.
  // ON  : 모드를 먼저 켜고(=띠/탭바 즉시 반영, recipient 데이터 fetch 시작) 인터스티셜만 2.5초.
  // OFF : 모드를 먼저 끄고(=내 농가 데이터 즉시 fetch) 인터스티셜이 풀스크린으로 위를 덮음.
  //       트랜지션 2.5초가 지나면 새 데이터 이미 로딩 완료 — 끝나면 즉시 fully loaded 홈.
  const handleToggleHelperMode = useCallback((on: boolean) => {
    if (on) {
      setHelperModeOn(true);
      setHelperTransitioning("enter");
      window.setTimeout(() => setHelperTransitioning(null), 2500);
    } else {
      // helperModeOn 을 먼저 false → effectiveFarmerIdForApp 즉시 변경 → useEffect 가
      // 트랜지션 시작 시점에 fetch 시작. 풀스크린 트랜지션이 깔린 시각 깜빡임 가림.
      setHelperModeOn(false);
      setHelperTransitioning("leave");
      window.setTimeout(() => {
        setHelperTransitioning(null);
      }, 2500);
    }
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const n = await fetchFarmerUnreadCount(SAMPLE_USER_CONTEXT.farmer_id);
      // 알림 시간대 window 밖이면 배지 숨김 (방해 안 함). 폴링은 그대로 진행.
      setUnreadCount(isInNotifWindow() ? n : 0);
    } catch {
      setUnreadCount(0);
    }
  }, []);

  const refreshHelperRole = useCallback(async () => {
    try {
      const res = await fetchCurrentHelperRole(SAMPLE_USER_CONTEXT.farmer_id);
      setHelperRole(res.role);
      setHelperPair(res.pair);
      // 본인 동의가 아직 안 됐고 pair 가 pending 이면 동의 모달 자동 노출.
      if (res.pair && res.role !== "none") {
        const myAppr = res.role === "helper" ? res.pair.helper_approved_at : res.pair.recipient_approved_at;
        if (!myAppr) setConsentOpen(true);
      }
    } catch {
      setHelperRole("none");
      setHelperPair(null);
    }
  }, []);

  // 데모 로그인이 이미 돼 있으면 (localStorage 에 farmer_id 보존) splash 를 건너뛰고
  // 바로 home 으로. SSR/hydration mismatch 방지를 위해 마운트 직후 effect 로 처리.
  useEffect(() => {
    if (hasSampleLogin()) setCurrentScreen("home");
  }, []);

  // mount 시 (1) 저장된 글자 크기 옵션을 body 에 적용 (2) 약관 미동의면 동의 모달 띄움.
  useEffect(() => {
    applyFontScaleToBody(getFontScale());
    if (!hasAgreedToTerms()) setTermsOpen(true);
  }, []);

  useEffect(() => {
    void refreshUnreadCount();
    void refreshHelperRole();
    // 60초마다 polling — 가벼운 정도. 향후 SSE/WebSocket 으로 교체 가능.
    const t = setInterval(() => {
      void refreshUnreadCount();
      void refreshHelperRole();
    }, 60_000);
    return () => clearInterval(t);
  }, [refreshUnreadCount, refreshHelperRole]);

  async function handleApproveHelper() {
    if (!helperPair) return;
    try {
      await approveHelperPair(SAMPLE_USER_CONTEXT.farmer_id, helperPair.helper_user_no, helperPair.help_seq);
      setConsentOpen(false);
      await refreshHelperRole();
    } catch (e) {
      alert(e instanceof Error ? e.message : "동의 처리에 실패했어요.");
    }
  }

  async function refreshDiaryRecords() {
    // backend 연결 실패 (예: 폰에서 LAN 미노출) 시에도 화면이 깨지지 않도록 swallow.
    try {
      const records = await listDiaryRecords();
      setDiaryRecords(records);
    } catch (error) {
      console.warn("[refreshDiaryRecords] 실패 — 빈 목록으로 진행:", error);
    }
  }

  // 도움 모드 ON 일 때는 recipient 의 farmer_id 로 parcel 캐싱.
  const effectiveFarmerIdForApp =
    helperRole === "helper" && helperModeOn && helperPair?.is_active && helperPair?.recipient_amo_regno
      ? helperPair.recipient_amo_regno
      : SAMPLE_USER_CONTEXT.farmer_id;

  useEffect(() => {
    void refreshDiaryRecords();
    void fetchFarmerParcels(effectiveFarmerIdForApp)
      .then(primeFarmerParcels)
      .catch((error) => {
        console.warn("[fetchFarmerParcels] 실패 — seed 폴백 유지:", error);
      });
  }, [effectiveFarmerIdForApp]);

  function handleManualDiarySaved(input: ManualDiaryInput, record: DiaryRecord) {
    setInputMethod("manual");
    setSavedRecord({
      date: record.work_date,
      work: record.work_stage_detail || input.work,
      field: input.field,
      amount: "-",
      business: "공익직불제 준수사항",
      hasPhoto: record.linked_evidence_ids.length > 0,
      memo: record.work_detail,
      inputMethod: "manual",
    });
    setSelectedJournalRecord(record);
    void refreshDiaryRecords();
    setTodoItems((prev) =>
      prev.map((t) => {
        if (record.work_stage_detail.includes("비료") && t.text.includes("비료")) return { ...t, done: true };
        if (record.work_stage_detail.includes("물") && t.text.includes("물")) return { ...t, done: true };
        if (record.linked_evidence_ids.length > 0 && t.text.includes("사진")) return { ...t, done: true };
        return t;
      }),
    );
  }

  function navigate(screen: Screen) {
    if (screen === "home" || screen === "journal") void refreshDiaryRecords();
    setCurrentScreen(screen);
    const tabMap: Partial<Record<Screen, Tab>> = {
      home: "home",
      journal: "journal",
      journalDetail: "journal",
      business: "business",
      businessDetail: "business",
      help: "help",
      settings: "settings",
    };
    if (tabMap[screen]) setSelectedTab(tabMap[screen]!);
  }

  function handleTabPress(tab: Tab) {
    setSelectedTab(tab);
    setCurrentScreen(tab as Screen);
  }

  function handleTodoAction(_action: "record" | "photo", todo: TodoItemApi | null) {
    setSelectedTodo(todo);
  }

  // 알림 클릭 시 content_cd 에 따라 후속 작업 분기.
  //   HLP_INV  → 도움 동의 모달 즉시 노출
  //   HLP_REV  → 이미 종료된 관계 — 별도 액션 없이 닫기
  //   RETAKE / EVID_DEL → "사진 찍으러 갈까요?" prompt → photoInput
  //   MANUAL / DIA_DEL / TODO_DUE → "음성으로 기록하러 갈까요?" prompt → voiceInput
  function handleNotificationAction(content_cd: string) {
    if (content_cd === "HLP_INV") {
      if (helperPair && (helperRole === "helper" || helperRole === "recipient")) {
        setConsentOpen(true);
      }
      return;
    }
    if (content_cd === "HLP_REV") {
      return;
    }
    if (content_cd === "RETAKE" || content_cd === "EVID_DEL") {
      setActionPrompt("photo");
      return;
    }
    if (content_cd === "MANUAL" || content_cd === "DIA_DEL" || content_cd === "TODO_DUE") {
      setActionPrompt("voice");
      return;
    }
  }

  function handlePromptConfirm() {
    if (!actionPrompt) return;
    const target: Screen = actionPrompt === "photo" ? "photoInput" : "voiceInput";
    setActionPrompt(null);
    navigate(target);
  }

  function handleBusinessPhotoUploadRequest(business: Business) {
    const prjId = business.prj_id || business.project_id || "";
    const projectId = business.project_id || business.prj_id || prjId;
    setSelectedTodo({
      todo_id: `business_${prjId}_photo`,
      // group_no 는 backend 에서 farmer_id 로 동적 resolve 합니다. 0 = "미지정".
      group_no: 0,
      prj_id: prjId,
      project_id: projectId,
      activity_id: "",
      job_cd: "GENERAL",
      todo_title: `${business.name} 증빙 등록`,
      activity_name: business.name,
      job_name: business.name,
      required_evidence_types: [],
      parcel_no: "1",
      field_id: "",
      due_date: null,
      start_date: null,
      status: "pending",
      computed_status: "pending",
      remark: "사업 상세 화면에서 증빙 사진을 등록합니다.",
    });
    navigate("photoInput");
  }

  // 도우미 모드 활성 시 (helperBannerActive) — 헤더(저탄마을/날짜/알림 종) 와 하단 탭바를 모두
  // 숨겨서 helper 가 recipient 의 홈 화면 본문에만 집중하도록 한다. 상단 띠만 남음.
  const helperBannerActive =
    helperModeOn && helperRole === "helper" && helperPair?.is_active === true;
  const showNav = !HIDE_NAV.includes(currentScreen) && !helperBannerActive;
  const showHeader = !HIDE_HEADER.includes(currentScreen) && !helperBannerActive;

  // 화면 전환 시 스크롤 최상단으로 — 이전 화면 스크롤 위치가 이어지지 않게.
  // 세 단계 reset 으로 자식 컴포넌트가 늦게 scrollIntoView 호출하는 경우(예: VoiceInputScreen
  // 의 chat thread auto-scroll)까지 잡음.
  useEffect(() => {
    const reset = () => {
      if (contentScrollRef.current) contentScrollRef.current.scrollTop = 0;
      if (typeof window !== "undefined") window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };
    // 1) 즉시 — 부모 reset
    reset();
    // 2) 다음 frame — DOM 첫 mount 직후
    const raf = requestAnimationFrame(reset);
    // 3) 100ms 후 — 자식 useEffect 가 scrollIntoView 호출한 뒤 한 번 더 강제 reset
    const t = window.setTimeout(reset, 100);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [currentScreen]);

  return (
    <HelperModeProvider role={helperRole} pair={helperPair} modeOn={helperModeOn}>
    <div className="relative w-full flex flex-col min-h-screen" style={{ background: "#ffffff" }}>
      {/* 도움 모드 띠 — helper 가 도와주러 가기 활성화 시 화면 최상단 초록 띠.
          메인 헤더와 동일 높이(56px)로 키워 "도움 주는 중" 임을 확실히 강조. */}
      {helperBannerActive && helperPair && (
        <div
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4"
          style={{
            background: "var(--primary, #2f6d4f)",
            color: "#fff",
            height: 56,
            fontWeight: 800,
            paddingTop: "env(safe-area-inset-top)",
            boxShadow: "0 2px 8px rgba(31, 42, 31, 0.08)",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: fs(22) }}>🤝</span>
            <span style={{ fontSize: fs(17), fontWeight: 800, letterSpacing: "-0.01em" }}>
              {helperPair.recipient_name || `농가 ${helperPair.recipient_user_no}`}님 기록 도와드리는 중
            </span>
          </span>
          <button
            type="button"
            onClick={() => handleToggleHelperMode(false)}
            style={{
              background: "rgba(255,255,255,0.20)",
              border: "1px solid rgba(255,255,255,0.45)",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: fs(14),
              fontWeight: 800,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            도움 마치기
          </button>
        </div>
      )}

      {/* 상단 앱 헤더 — 두 줄: 날짜(큰) / 날씨(작은) + 우측 알림. 좁은 화면에서 wrap 방지. */}
      {showHeader && (
        <header
          className="fixed left-0 right-0 z-50 flex items-center justify-between px-4 gap-3"
          style={{
            top: helperBannerActive ? 38 : 0,
            background: "#ffffff",
            height: 70,
            borderBottom: "1px solid var(--line-soft)",
            boxShadow: "0 2px 8px rgba(31, 42, 31, 0.04)",
          }}
        >
          <div className="flex flex-col min-w-0 flex-1 gap-0.5">
            {/* 1행 — 날짜. 큰 글씨, 좁은 화면에서도 항상 보임. */}
            <span
              className="leading-tight truncate"
              style={{ color: "var(--ink)", fontSize: fs(18), fontWeight: 800, letterSpacing: "-0.02em" }}
            >
              {(() => {
                const days = ["일", "월", "화", "수", "목", "금", "토"];
                return `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 ${days[selectedDate.getDay()]}요일`;
              })()}
            </span>
            {/* 2행 — 날씨 (현재 + 최고/최저). 작게, 자연 truncate. */}
            <span
              className="leading-tight truncate"
              style={{ color: "var(--ink-soft)", fontSize: fs(13), fontWeight: 700 }}
            >
              <WeatherWidget villeId={SAMPLE_USER_CONTEXT.ville_id} cropCd="rice" compact />
            </span>
          </div>
          <button
            type="button"
            aria-label={unreadCount > 0 ? `안 읽은 알림 ${unreadCount}건` : "알림"}
            className="active:opacity-70 flex items-center"
            style={{
              color: "var(--ink-soft)",
              minHeight: 40,
              marginRight: -4,
              padding: "8px 12px",
              gap: 6,
              background: "var(--bg-soft, #f7f5ef)",
              borderRadius: 999,
              border: "1px solid var(--line-soft)",
            }}
            onClick={() => setNotifPanelOpen(true)}
          >
            <Bell className="w-5 h-5" />
            <span
              style={{
                fontSize: fs(14),
                fontWeight: 700,
                color: "var(--ink)",
                letterSpacing: "-0.01em",
              }}
            >
              알림
            </span>
            {/* 안 읽은 알림 카운트 — chip 안 inline 배지. 노안 가독성 위해 fontSize 13 weight 800. */}
            {unreadCount > 0 && (
              <span
                aria-hidden
                style={{
                  minWidth: 20,
                  height: 20,
                  padding: "0 6px",
                  borderRadius: 999,
                  background: "var(--danger, #d04545)",
                  color: "#fff",
                  fontSize: fs(13),
                  fontWeight: 800,
                  lineHeight: "20px",
                  textAlign: "center",
                  boxShadow: "0 2px 6px rgba(208, 69, 69, 0.35)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        </header>
      )}

      <div
        ref={contentScrollRef}
        className={`flex-1 min-h-0 overflow-y-auto scrollbar-hide ${showNav ? "pb-24" : ""}`}
        style={{ paddingTop: helperBannerActive ? 56 : showHeader ? 70 : 0 }}
      >
        {/* 단발성 화면 — splash/login/입력/saveComplete/detail — conditional 그대로 (방문 후 unmount 자연) */}
        {currentScreen === "splash" && <SplashScreen navigate={navigate} />}
        {currentScreen === "loginSelect" && <LoginSelectScreen navigate={navigate} />}
        {currentScreen === "manualLogin" && <ManualLoginScreen navigate={navigate} />}
        {currentScreen === "voiceInput" && (
          <VoiceInputScreen
            navigate={navigate}
            setSavedRecord={setSavedRecord}
            setInputMethod={setInputMethod}
            onDiarySaved={handleManualDiarySaved}
            selectedTodo={selectedTodo}
          />
        )}
        {currentScreen === "manualInput" && (
          <ManualInputScreen
            navigate={navigate}
            onDiarySaved={handleManualDiarySaved}
            recentUploadedEvidence={recentUploadedEvidence}
            selectedTodo={selectedTodo}
          />
        )}
        {currentScreen === "photoInput" && (
          <PhotoInputScreen
            navigate={navigate}
            setSavedRecord={setSavedRecord}
            setInputMethod={setInputMethod}
            setUploadedPhoto={setUploadedPhoto}
            onEvidenceUploaded={setRecentUploadedEvidence}
            recentUploadedEvidence={recentUploadedEvidence}
            selectedTodo={selectedTodo}
          />
        )}
        {currentScreen === "saveComplete" && <SaveCompleteScreen savedRecord={savedRecord} inputMethod={inputMethod} navigate={navigate} />}
        {currentScreen === "journalDetail" && <JournalDetailScreen record={selectedJournalRecord} navigate={navigate} />}
        {currentScreen === "businessDetail" && (
          <BusinessDetailScreen business={selectedBusiness} navigate={navigate} onRequestPhotoUpload={handleBusinessPhotoUploadRequest} />
        )}

        {/* keep-alive 5개 — 한 번 mount 후 display 만 toggle. 탭 전환 시 fetch 재실행 없음. */}
        {mountedScreens.has("home") && (
          <div style={{ display: currentScreen === "home" ? "block" : "none" }}>
            <HomeScreen
              selectedDate={selectedDate}
              todoItems={todoItems}
              setTodoItems={setTodoItems}
              missingPhotoCount={diaryRecords.filter((r) => r.linked_evidence_ids.length === 0).length}
              navigate={navigate}
              onTodoAction={handleTodoAction}
              helperRole={helperRole}
              helperPair={helperPair}
              helperModeOn={helperModeOn}
              onToggleHelperMode={handleToggleHelperMode}
              onOpenConsent={() => setConsentOpen(true)}
            />
          </div>
        )}
        {mountedScreens.has("journal") && (
          <div style={{ display: currentScreen === "journal" ? "block" : "none" }}>
            <JournalScreen
              navigate={navigate}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              diaryRecords={diaryRecords}
              setSelectedJournalRecord={setSelectedJournalRecord}
            />
          </div>
        )}
        {mountedScreens.has("business") && (
          <div style={{ display: currentScreen === "business" ? "block" : "none" }}>
            <BusinessScreen navigate={navigate} setSelectedBusiness={setSelectedBusiness} />
          </div>
        )}
        {mountedScreens.has("help") && (
          <div style={{ display: currentScreen === "help" ? "block" : "none" }}>
            <HelpScreen />
          </div>
        )}
        {mountedScreens.has("settings") && (
          <div style={{ display: currentScreen === "settings" ? "block" : "none" }}>
            <SettingsScreen navigate={navigate} />
          </div>
        )}
      </div>

      {showNav && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 lv-bottom-nav"
          style={{
            background: "#ffffff",
            borderTop: "1px solid var(--line-soft)",
            boxShadow: "0 -2px 8px rgba(31, 42, 31, 0.06)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <div className="flex items-end pt-2 pb-2 px-2 relative">
            {NAV_ITEMS.map(({ key, label, icon }, index) => {
              const isActive = selectedTab === key;
              const isCenter = index === CENTER_NAV_INDEX;

              if (isCenter) {
                // 가운데 FAB — 작은 원 + 살짝 떠 있음 + 부드러운 그림자 (페이지에 압박 X)
                // 활성 시 translateY 한 칸 더 들뜨게 + 그림자 ↑ 로 마이크로 인터랙션.
                return (
                  <button
                    key={key}
                    onClick={() => handleTabPress(key)}
                    className="flex-1 flex flex-col items-center justify-end gap-1 transition-colors active:opacity-90"
                  >
                    <div
                      className="rounded-full flex items-center justify-center transition-all"
                      style={{
                        width: 44,
                        height: 44,
                        background: isActive ? "var(--primary)" : "#ffffff",
                        color: isActive ? "#ffffff" : "var(--ink-soft)",
                        transform: isActive ? "translateY(-12px)" : "translateY(-10px)",
                        boxShadow: isActive
                          ? "0 6px 14px rgba(47, 109, 79, 0.32)"
                          : "0 2px 6px rgba(31, 42, 31, 0.10)",
                        border: isActive ? "none" : "1px solid var(--line)",
                      }}
                    >
                      {icon}
                    </div>
                    <span
                      style={{
                        fontSize: fs(13),
                        color: isActive ? "var(--primary)" : "var(--muted-2)",
                        fontWeight: isActive ? 700 : 500,
                        marginTop: -6,
                        whiteSpace: "nowrap",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {label}
                    </span>
                  </button>
                );
              }

              // 일반 탭 — 활성 시 상단에 짧은 막대 indicator + 색/굵기 강조.
              return (
                <button
                  key={key}
                  onClick={() => handleTabPress(key)}
                  className="flex-1 flex flex-col items-center justify-center gap-1 py-1 transition-colors active:opacity-80 relative"
                >
                  {/* 활성 indicator — 상단 짧은 막대 (비활성 width 0). transition 으로 부드럽게. */}
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: -2,
                      height: 3,
                      width: isActive ? 24 : 0,
                      background: "var(--primary)",
                      borderRadius: 999,
                      transition: "width 0.18s ease",
                    }}
                  />
                  <div style={{ color: isActive ? "var(--primary)" : "var(--muted-2)" }}>{icon}</div>
                  <span
                    style={{
                      fontSize: fs(13),
                      color: isActive ? "var(--primary)" : "var(--muted-2)",
                      fontWeight: isActive ? 700 : 500,
                      whiteSpace: "nowrap",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 알림 panel — 헤더 종 클릭 시 slide-up. 본인 알림 수신/읽음.
          알림 클릭 시 종류별 후속 작업은 handleNotificationAction 이 처리. */}
      <NotificationPanel
        farmerId={SAMPLE_USER_CONTEXT.farmer_id}
        open={notifPanelOpen}
        onClose={() => setNotifPanelOpen(false)}
        onChanged={() => void refreshUnreadCount()}
        onAction={handleNotificationAction}
      />

      {/* 알림 클릭 → 사진/음성 입력으로 이동할지 확인하는 가운데 confirm 모달. */}
      <NotificationActionPromptModal
        open={actionPrompt !== null}
        kind={actionPrompt || "photo"}
        onConfirm={handlePromptConfirm}
        onCancel={() => setActionPrompt(null)}
      />

      {/* 도우미 모드 전환 인터스티셜 — 2.5초 풀스크린 기차 애니메이션.
          enter = 다른 농가로 가는 중 / leave = 내 농장으로 돌아오는 중. */}
      {helperTransitioning && (
        <HelperModeTransitionScreen
          direction={helperTransitioning}
          recipientName={helperPair?.recipient_name || undefined}
        />
      )}

      {/* 홈 첫 진입 로딩 — 세션당 1회 (sessionStorage). 1.5초 후 fade-out. */}
      {homeLoading && <HomeLoadingScreen />}

      {/* 기록 도우미 동의 모달 — pending pair 가 있을 때 자동 노출. */}
      {helperPair && (helperRole === "helper" || helperRole === "recipient") && (
        <HelperConsentModal
          pair={helperPair}
          myRole={helperRole}
          myFarmerId={SAMPLE_USER_CONTEXT.farmer_id}
          open={consentOpen}
          onClose={() => setConsentOpen(false)}
          onApprove={() => void handleApproveHelper()}
        />
      )}

      {/* 첫 진입 시 약관 동의 모달 — localStorage.tos_agreed_v1 가 없을 때만 자동 노출.
          한 번 동의하면 다음부터는 안 뜸. version bump 시 key 갱신으로 재동의 받기 가능. */}
      <TermsAgreementModal open={termsOpen} onAgreed={() => setTermsOpen(false)} />
    </div>
    </HelperModeProvider>
  );
}
