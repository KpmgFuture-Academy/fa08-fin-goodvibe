"use client";

/**
 * LocavilleApp — 앱 셸(라우팅 + 상단바 + 하단탭 + 모드 분기 + 로딩 게이트).
 * 화면 전환 상태만 관리하는 골격입니다. 데이터는 각 화면에 주입하세요.
 * Claude Code: 아래 "DATA" 표시 지점을 lib/ 서비스로 연결.
 */

import { useEffect, useState } from "react";
import { Bell, Settings as SettingsIcon, Sun, NotebookText, Leaf, HelpCircle, HeartHandshake } from "lucide-react";

import HomeScreen, { type RetakeRequest, type ParcelRef } from "./HomeScreen";
import StandardHomeList from "./StandardHomeList";
import ModeChooser from "./ModeChooser";
import PhotoInputScreen from "./PhotoInputScreen";
import ManualInputScreen, { type JobGroup } from "./ManualInputScreen";
import SaveCompleteScreen from "./SaveCompleteScreen";
import JournalScreen, { type DiaryRecord, type ActivityProgress } from "./JournalScreen";
import JournalDetailScreen from "./JournalDetailScreen";
import { BusinessScreen, BusinessDetailScreen, type Business } from "./BusinessScreens";
import HelpScreen, { type FaqItem } from "./HelpScreen";
import SettingsScreen from "./SettingsScreen";
import LoginSelectScreen from "./LoginSelectScreen";
import ManualLoginScreen from "./ManualLoginScreen";
import NotificationPanel, { type NotificationItem } from "./NotificationPanel";
import { HelperModeTransitionScreen } from "./HelperModeTransitionScreen";
import { HomeLoadingScreen } from "./HomeLoadingScreen";
import HelperConsentModal from "./HelperConsentModal";
import TermsAgreementModal from "./TermsAgreementModal";
import type { TodoItemApi } from "@/lib/todo-service";
import type { FarmHelperPair } from "@/lib/farm-helper-service";
import { SAMPLE_USER_CONTEXT } from "@/lib/sample-user-context";
import { hasAgreedToTerms, recordTermsAgreement, isInNotifWindow } from "@/lib/preferences";

type Screen =
  | "loginSelect" | "manualLogin" | "modeChoose" | "home" | "manualInput" | "photoInput"
  | "saveComplete" | "journal" | "journalDetail" | "business" | "businessDetail" | "help" | "settings";

type UiMode = "easy" | "standard";

// 화면 모드 무관 풀스크린/푸시(상단바·하단탭 숨김).
const HIDE_CHROME: Screen[] = ["loginSelect", "manualLogin", "modeChoose", "manualInput", "photoInput", "saveComplete", "journalDetail", "businessDetail", "settings"];
// 쉬운 모드에서도 하단탭으로 노출되는 화면 — 현재는 없음(사업도 탭으로 승격).
const PUSHED_IN_EASY: Screen[] = [];

const NAV_EASY = [
  { key: "home", label: "오늘", Icon: Sun },
  { key: "journal", label: "영농일지", Icon: NotebookText },
  { key: "business", label: "사업", Icon: Leaf },
  { key: "help", label: "도움말", Icon: HelpCircle },
] as const;
const NAV_STD = [
  { key: "home", label: "오늘", Icon: Sun },
  { key: "journal", label: "영농일지", Icon: NotebookText },
  { key: "business", label: "사업", Icon: Leaf },
  { key: "help", label: "도움말", Icon: HelpCircle },
] as const;

export interface LocavilleData {
  /** 저장/업로드 귀속 대상 farmer_id (도우미 모드면 recipient). */
  farmerId: string;
  userName: string;
  villageLabel: string;
  dateLabel: string;        // "6월 4일 목요일"
  todayYmd: string;         // "2026-06-04"
  weather: { label: string; tmp: number; iconSrc: string };
  todos: TodoItemApi[];     // 미완료, due 오름차순 — DATA
  parcels: ParcelRef[];     // DATA
  retake: RetakeRequest | null; // DATA
  diary: DiaryRecord[];     // DATA
  progress: ActivityProgress[]; // DATA
  businesses: Business[];   // DATA
  jobGroups: JobGroup[];    // DATA
  faq: FaqItem[];
  notifications: NotificationItem[]; // DATA
  helperRecipientName: string | null;
  /** 오늘 한마디 (advice 시스템 한 줄). 없으면 null. */
  advice: string | null; // DATA
}

export interface LocavilleAppProps {
  data: LocavilleData;
  loading?: boolean;
  /** preferences 에서 복원한 모드. 지정되면 ModeChooser/로그인 건너뛰고 바로 home. */
  initialUiMode?: UiMode | null;
  /** 로그인은 됐지만 모드 미선택(첫 진입) — ModeChooser 부터 시작. */
  initialLoggedIn?: boolean;
  /** 모드 선택/변경을 preferences 에 영속화. */
  onPickMode?: (m: UiMode) => void;
  /** 도우미 "도와주러 가기" 토글 — 컨테이너가 effective farmer 전환 + 재조회. */
  onToggleHelper?: (on: boolean) => void;
  /** 알림 1건 읽음 / 전체 읽음 — backend 반영. */
  onNotifRead?: (notice_no: number) => void;
  onNotifReadAll?: () => void;
  /** 로그아웃 — 세션 종료. */
  onLogout?: () => void;
  /** 도움말 RAG 답변(미연결 시 FAQ 폴백). */
  answerFor?: (q: string) => string;
  /** 저장/업로드 성공 후 데이터 재조회 트리거. */
  onDataChanged?: () => void;
  /** 기록 도우미 — 본인 역할/활성 pair (동의 모달용). */
  helperRole?: "helper" | "recipient" | "none";
  helperPair?: FarmHelperPair | null;
  /** 본인 동의가 아직 안 된 pending pair 면 true → 동의 모달 자동 노출. */
  consentPending?: boolean;
  /** 동의 처리 — approveHelperPair + 재조회. */
  onApproveHelper?: () => Promise<void> | void;
}

export default function LocavilleApp({
  data,
  loading,
  initialUiMode = null,
  initialLoggedIn = false,
  onPickMode,
  onToggleHelper,
  onNotifRead,
  onNotifReadAll,
  onLogout,
  answerFor,
  onDataChanged,
  helperRole = "none",
  helperPair = null,
  consentPending = false,
  onApproveHelper,
}: LocavilleAppProps) {
  const [screen, setScreen] = useState<Screen>(
    initialUiMode ? "home" : initialLoggedIn ? "modeChoose" : "loginSelect",
  );
  const [tab, setTab] = useState("home");
  const [uiMode, setUiMode] = useState<UiMode | null>(initialUiMode); // null → 첫 진입 선택
  const [selectedTodo, setSelectedTodo] = useState<TodoItemApi | null>(null);
  const [selectedDiary, setSelectedDiary] = useState<DiaryRecord | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  // BusinessDetailScreen 의 뒤로 가기 출발지 — 설정에서 들어왔으면 settings 로 되돌림.
  const [businessDetailFrom, setBusinessDetailFrom] = useState<"business" | "settings">("business");
  // saveComplete 가 "voice/manual/photo" 분기를 받지만 단일 진입점 통합으로 모두 manual 로 수렴.
  const [saveMethod, setSaveMethod] = useState<"voice" | "manual" | "photo">("manual");
  // 저장 완료 화면 요약(작업/위치) — 입력 화면이 실제 값으로 채움.
  const [saveSummary, setSaveSummary] = useState<{ job?: string; parcelLabel?: string }>({});
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationItem[]>(data.notifications);
  const [helperOn, setHelperOn] = useState(false);
  const [transition, setTransition] = useState<null | "enter" | "leave">(null);
  // 도우미 전환 화면(트랙터)이 최소 노출 시간(애니메이션 1회 = 2.5초)을 채웠는지.
  const [transitionMinDone, setTransitionMinDone] = useState(false);
  // 재방문(저장된 모드로 바로 home 진입)이면 데이터 로딩 동안 HomeLoadingScreen 노출.
  const [showLoading, setShowLoading] = useState(!!initialUiMode);

  // 컨테이너가 데이터를 재조회(예: 도우미 모드 전환)하면 알림 목록 동기화.
  useEffect(() => { setNotifs(data.notifications); }, [data.notifications]);

  // 기록 도우미 동의 모달 — pending pair 가 감지되면 자동 노출.
  const [consentOpen, setConsentOpen] = useState(false);
  useEffect(() => { if (consentPending) setConsentOpen(true); }, [consentPending]);

  // 첫 진입 약관 동의 게이트 — 미동의면 자동 노출(법적 필수). hydration 안전 위해 mount 후 결정.
  const [termsOpen, setTermsOpen] = useState(false);
  useEffect(() => { if (!hasAgreedToTerms()) setTermsOpen(true); }, []);

  // 알림 클릭 → 사진/음성 화면 이동 전 확인 (실수 탭 방지, 시니어 친화).
  const [actionPrompt, setActionPrompt] = useState<"photo" | "voice" | null>(null);

  const standard = uiMode === "standard";
  const easy = uiMode === "easy";
  // 방해금지 시간대(설정) 밖이면 배지 숨김 — 알림 자체는 그대로, 방해만 줄임.
  const unread = isInNotifWindow() ? notifs.filter((n) => !n.read).length : 0;

  function navigate(s: string) { setScreen(s as Screen); if (["home", "journal", "business", "help"].includes(s)) setTab(s); }
  const onTodoAction = (_a: "record" | "photo", t: TodoItemApi | null) => setSelectedTodo(t);
  function toggleHelper(on: boolean) { setTransition(on ? "enter" : "leave"); setTransitionMinDone(false); setHelperOn(on); onToggleHelper?.(on); }

  // 모드 선택 직후 홈 로딩 게이트 — 백엔드 데이터(todos/diary 등)가 실제로 준비될 때까지 유지.
  function pickMode(m: UiMode) {
    setUiMode(m);
    onPickMode?.(m);
    setShowLoading(true);
    navigate("home");
  }
  // 로딩 스크린은 backend 로딩(loading)이 끝날 때까지 표시. 끝나면 짧은 여운 후 숨김.
  // (조기 2.5초 cap 제거 — 백엔드가 느려도 데이터가 채워질 때까지 기다림.)
  useEffect(() => {
    if (!showLoading) return;
    if (!loading) {
      const t = setTimeout(() => setShowLoading(false), 400);
      return () => clearTimeout(t);
    }
    // 비정상적으로 오래 걸릴 때를 위한 failsafe (보통은 loading=false 가 먼저 해제).
    const failsafe = setTimeout(() => setShowLoading(false), 12000);
    return () => clearTimeout(failsafe);
  }, [showLoading, loading]);

  // 도우미 전환 화면은 (1) 트랙터 애니메이션 1회(2.5초) + (2) 새 농가 데이터 로딩 완료,
  // 둘 다 끝나야 닫는다. → 전환이 사라지는 순간 화면이 이미 채워져 있어 로딩이 비치지 않는다.
  useEffect(() => {
    if (!transition) return;
    const minT = setTimeout(() => setTransitionMinDone(true), 2500);
    // 안전장치 — 로딩이 비정상적으로 길어도 전환이 영원히 안 닫히지 않게.
    const failsafe = setTimeout(() => { setTransition(null); setTransitionMinDone(false); }, 7000);
    return () => { clearTimeout(minT); clearTimeout(failsafe); };
  }, [transition]);
  useEffect(() => {
    if (transition && transitionMinDone && !loading) { setTransition(null); setTransitionMinDone(false); }
  }, [transition, transitionMinDone, loading]);

  function notifAction(cd: string) {
    if (cd === "HLP_INV") { if (helperPair && helperRole !== "none") setConsentOpen(true); return; }
    if (cd === "HLP_REV") return; // 이미 종료된 도움 관계 — 별도 액션 없음
    if (cd === "RETAKE" || cd === "EVID_DEL") { setSelectedTodo(null); setActionPrompt("photo"); }
    else if (cd === "MANUAL" || cd === "TODO_DUE" || cd === "DIA_DEL") { setSelectedTodo(null); setActionPrompt("voice"); }
  }
  // 사진 prompt(retake/evidence) 는 to-do 사진 흐름(photoInput) 로,
  // 자유 기록 prompt(manual/todo_due/diary) 는 영농일지(manualInput) 로 분기.
  function confirmPrompt() {
    const target = actionPrompt === "photo" ? "photoInput" : "manualInput";
    setActionPrompt(null);
    setNotifOpen(false);
    navigate(target);
  }

  const helperBanner = helperOn;
  const hidden = HIDE_CHROME.includes(screen) || (!standard && PUSHED_IN_EASY.includes(screen));
  const showChrome = !hidden && !helperBanner;
  const navItems = standard ? NAV_STD : NAV_EASY;
  const W = data.weather;

  const homeProps = {
    userName: data.userName, todos: data.todos, parcels: data.parcels, retake: helperOn ? data.retake : data.retake,
    advice: data.advice,
    farmerId: data.farmerId,
    onDataChanged,
    helperRecipientName: helperOn ? null : data.helperRecipientName, helperModeOn: helperOn,
    navigate, onTodoAction, onStartRetake: () => {}, onToggleHelperMode: toggleHelper,
  };

  return (
    <div className="relative mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden bg-[var(--lv-bg)]">
      {/* status-bar safe-area — 노치만큼만(데스크톱/노치 없으면 0 → 상단바가 화면 맨 위에 붙음) */}
      <div className="shrink-0" style={{ height: "env(safe-area-inset-top)", background: helperBanner ? "var(--lv-primary)" : showChrome ? "var(--lv-header)" : "#fff" }} />

      {/* 도우미 모드 띠 */}
      {helperBanner && (
        <div className="flex h-[52px] shrink-0 items-center justify-between bg-[var(--lv-primary)] px-4 text-white">
          <span className="flex items-center gap-2"><HeartHandshake size={20} className="shrink-0" /><span className="text-[16px] font-semibold">{data.helperRecipientName}님 기록 도와드리는 중</span></span>
          <button onClick={() => toggleHelper(false)} className="rounded-lg bg-white/20 px-3.5 py-2 text-[14px] font-semibold text-white">도움 마치기</button>
        </div>
      )}

      {/* 상단 바 */}
      {showChrome && (
        <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 rounded-b-[28px] bg-[var(--lv-header)] px-5 shadow-[0_12px_32px_rgba(16,36,25,0.18)]" style={{ height: easy ? 78 : 68 }}>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={`truncate font-bold tracking-tight text-white ${easy ? "text-[22px]" : "text-[19px]"}`}>{data.dateLabel}</span>
            <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-[color:var(--lv-on-dark-soft)] ${easy ? "text-[15px]" : "text-[13px]"}`}>
              <img src={W.iconSrc} alt="" width={easy ? 19 : 16} height={easy ? 19 : 16} /><span>{W.label} {W.tmp}°</span>
            </span>
          </div>
          <button onClick={() => setNotifOpen(true)} aria-label="알림" className="relative flex items-center justify-center rounded-full bg-white/10 text-white" style={{ width: 48, height: 48 }}>
            <Bell size={easy ? 24 : 22} />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[20px] rounded-full bg-[#c93b3b] px-1 text-center text-[11px] font-bold leading-[20px] text-white ring-2 ring-[var(--lv-header)]">{unread}</span>}
          </button>
          <button onClick={() => navigate("settings")} aria-label="설정" className="flex items-center justify-center rounded-full bg-white/10 text-white" style={{ width: 48, height: 48 }}>
            <SettingsIcon size={easy ? 24 : 22} />
          </button>
        </header>
      )}

      {/* 본문 — screen / showLoading 변경 시 div 가 remount 되며 lv-screen 슬라이드 모션 재생.
          loading=true 동안 자식이 mount 되면 animation 이 overlay 뒤에서 끝나버려, loading 끝난
          뒤에는 정적으로 보이는 문제 해결: showLoading 도 key 에 포함해 loading→ready 전환에
          remount 한 번 더 트리거. */}
      <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--lv-bg)]">
        <div key={`${screen}:${showLoading ? "load" : "ready"}`} className="lv-screen h-full">
        {screen === "loginSelect" && <LoginSelectScreen onLogin={() => navigate("modeChoose")} onManualLogin={() => navigate("manualLogin")} />}
        {screen === "manualLogin" && <ManualLoginScreen onBack={() => navigate("loginSelect")} />}
        {screen === "modeChoose" && <ModeChooser onPick={pickMode} />}
        {screen === "home" && (standard
          ? <StandardHomeList {...homeProps} />
          : <HomeScreen {...homeProps} simple />)}
        {screen === "journal" && <JournalScreen records={data.diary} progress={data.progress} todayYmd={data.todayYmd} easy={easy} navigate={navigate} onOpenRecord={(r) => { setSelectedDiary(r); navigate("journalDetail"); }} />}
        {screen === "journalDetail" && <JournalDetailScreen record={selectedDiary} dateLabel={() => data.dateLabel} navigate={navigate} />}
        {screen === "business" && <BusinessScreen businesses={data.businesses} navigate={navigate} onOpen={(b) => { setSelectedBusiness(b); setBusinessDetailFrom("business"); navigate("businessDetail"); }} easy={easy} />}
        {screen === "businessDetail" && <BusinessDetailScreen business={selectedBusiness} navigate={(s) => navigate(s === "business" && businessDetailFrom === "settings" ? "settings" : s)} onRequestPhoto={() => { setSelectedTodo(null); navigate("photoInput"); }} onSeeTodos={() => navigate(standard ? "home" : "journal")} farmerId={data.farmerId} easy={easy} />}
        {screen === "help" && <HelpScreen faq={data.faq} easy={easy} answerFor={answerFor} onCall={() => { if (typeof window !== "undefined") window.location.href = "tel:1588-0000"; }} />}
        {screen === "settings" && <SettingsScreen userName={data.userName} villageLabel={data.villageLabel} businesses={data.businesses} uiMode={uiMode ?? "easy"} onChangeMode={(m) => { setUiMode(m); onPickMode?.(m); }} navigate={navigate} onOpenBusiness={(b) => { setSelectedBusiness(b); setBusinessDetailFrom("settings"); navigate("businessDetail"); }} onLogout={() => { onLogout?.(); setUiMode(null); navigate("loginSelect"); }} />}
        {screen === "photoInput" && <PhotoInputScreen selectedTodo={selectedTodo} retake={data.retake} parcels={data.parcels} farmerId={data.farmerId} navigate={navigate} onPhotoSaved={() => { setSaveMethod("photo"); onDataChanged?.(); }} />}
        {screen === "manualInput" && <ManualInputScreen selectedTodo={selectedTodo} parcels={data.parcels} jobGroups={data.jobGroups} todayLabel={data.dateLabel} todayYmd={data.todayYmd} farmerId={data.farmerId} navigate={navigate} onManualSaved={(p) => { setSaveMethod("manual"); setSaveSummary({ job: data.jobGroups.flatMap((g) => g.jobs).find((j) => j.job_cd === p.jobCd)?.job_name, parcelLabel: data.parcels.find((pp) => pp.parcel_no === p.parcelNo)?.label }); onDataChanged?.(); }} />}
        {screen === "saveComplete" && <SaveCompleteScreen method={saveMethod} todayYmd={data.todayYmd} job={saveSummary.job} parcelLabel={saveSummary.parcelLabel} navigate={navigate} />}
        </div>
      </main>

      {/* 하단 탭 */}
      {showChrome && (
        <nav className="flex shrink-0 border-t border-[var(--lv-line-soft)] bg-white shadow-[0_-2px_14px_rgba(23,35,27,0.06)]" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
          {navItems.map((item) => {
            const active = tab === item.key;
            const Icon = item.Icon;
            return (
              <button key={item.key} onClick={() => navigate(item.key)} className="flex min-h-[66px] flex-1 flex-col items-center justify-center gap-1.5 pb-1 pt-2">
                <span className={`flex h-[32px] items-center justify-center rounded-[10px] transition-colors ${active ? "bg-[var(--lv-accent-soft)]" : ""}`} style={{ width: standard ? 56 : 62 }}>
                  <Icon size={standard ? 22 : 24} className={active ? "text-[color:var(--lv-primary)]" : "text-[color:var(--lv-muted-2)]"} strokeWidth={active ? 2.2 : 2} />
                </span>
                <span className={`whitespace-nowrap text-[14px] ${active ? "font-semibold text-[color:var(--lv-primary)]" : "font-medium text-[color:var(--lv-muted-2)]"}`}>{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <NotificationPanel open={notifOpen} items={notifs} onClose={() => setNotifOpen(false)}
        onRead={(n) => { setNotifs((p) => p.map((x) => (x.notice_no === n.notice_no ? { ...x, read: true } : x))); onNotifRead?.(n.notice_no); }}
        onReadAll={() => { setNotifs((p) => p.map((x) => ({ ...x, read: true }))); onNotifReadAll?.(); }}
        onAction={notifAction} />

      {transition && <HelperModeTransitionScreen direction={transition} recipientName={data.helperRecipientName ?? undefined} />}
      {showLoading && <HomeLoadingScreen />}

      {/* 기록 도우미 동의 모달 — pending pair 자동 노출 / 알림(HLP_INV) 클릭 시. */}
      {helperPair && (helperRole === "helper" || helperRole === "recipient") && (
        <HelperConsentModal
          pair={helperPair}
          myRole={helperRole}
          myFarmerId={SAMPLE_USER_CONTEXT.farmer_id}
          open={consentOpen}
          onClose={() => setConsentOpen(false)}
          onApprove={async () => { await onApproveHelper?.(); setConsentOpen(false); }}
        />
      )}

      {/* 알림 클릭 → 사진/음성 이동 확인 (실수 탭 방지). */}
      {actionPrompt && (
        <div className="absolute inset-0 z-[85] flex items-center justify-center bg-black/45 px-6">
          <div className="w-full max-w-[340px] rounded-3xl bg-white p-6 text-center shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--lv-accent-soft)]">
              {actionPrompt === "photo" ? <Bell size={28} className="text-[color:var(--lv-primary)]" /> : <Bell size={28} className="text-[color:var(--lv-primary)]" />}
            </div>
            <p className="mb-1.5 text-[19px] font-extrabold text-[color:var(--lv-ink)]">{actionPrompt === "photo" ? "사진 찍으러 갈까요?" : "음성으로 기록할까요?"}</p>
            <p className="mb-5 text-[14px] font-semibold leading-snug text-[color:var(--lv-muted)] [word-break:keep-all]">{actionPrompt === "photo" ? "카메라를 열어 증빙 사진을 찍어요." : "말로 오늘 한 일을 기록해요."}</p>
            <div className="flex gap-2.5">
              <button onClick={() => setActionPrompt(null)} className="flex-1 rounded-2xl border border-[var(--lv-line)] bg-[var(--lv-bg-soft)] py-3.5 text-[16px] font-bold text-[color:var(--lv-ink)]">다음에</button>
              <button onClick={confirmPrompt} className="flex-[1.3] rounded-2xl bg-[var(--lv-primary)] py-3.5 text-[16px] font-extrabold text-white shadow-[0_4px_12px_rgba(47,109,79,0.25)]">{actionPrompt === "photo" ? "사진 찍기" : "기록하기"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 첫 진입 약관 동의 게이트 — 법적 필수. 동의 전엔 모든 화면 위를 덮는다. */}
      <TermsAgreementModal
        open={termsOpen}
        mode="agree"
        onAgree={(loc) => { recordTermsAgreement(loc); setTermsOpen(false); }}
      />
    </div>
  );
}

/* Claude Code:
   - data 는 page/route 에서 lib/ 서비스로 채워 주입(서버컴포넌트 or SWR).
   - loading 플래그 = todos/diary fetch 진행 여부. 모드 선택 직후 HomeLoadingScreen
     이 그 동안 표시되고, 준비되면 사라집니다(최대 2.5초 cap).
   - 첫 진입 모드(uiMode=null)는 ModeChooser. 재방문은 preferences 에서 복원해
     바로 home 으로 보내세요. */
