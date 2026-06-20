/**
 * 사용자 환경설정 (접근성, 알림 시간대, 약관 동의) 의 localStorage 한 곳 관리.
 *
 * - 모든 키 prefix 없이 (web_user 의 `largeText` 같은 기존 키와 호환 유지)
 * - SSR-safe: `typeof window` 가드
 * - frontend only — backend 동의 이력 컬럼은 별개 작업 (정식 출시 단계)
 *
 * 사용:
 *   const size = getFontScale(); // "normal" | "large" | "xlarge"
 *   setFontScale("large");
 *   applyFontScaleToBody(size);  // body 의 data-large-text 갱신
 */

// ---------- 글자 크기 ----------
// web_user 의 Sidebar 와 호환을 위해 key 이름 "largeText" 유지.
// 값: "" (기본) / "1" (크게) / "2" (더 크게). body[data-large-text] selector 도 같음.

export type FontScale = "normal" | "large" | "xlarge";

const FONT_SCALE_KEY = "largeText";

const FONT_SCALE_TO_VALUE: Record<FontScale, string> = {
  normal: "",
  large: "1",
  xlarge: "2",
};

const VALUE_TO_FONT_SCALE: Record<string, FontScale> = {
  "": "normal",
  "1": "large",
  "2": "xlarge",
};

export function getFontScale(): FontScale {
  if (typeof window === "undefined") return "normal";
  const v = window.localStorage.getItem(FONT_SCALE_KEY) || "";
  return VALUE_TO_FONT_SCALE[v] ?? "normal";
}

export function setFontScale(scale: FontScale): void {
  if (typeof window === "undefined") return;
  const v = FONT_SCALE_TO_VALUE[scale];
  if (v) window.localStorage.setItem(FONT_SCALE_KEY, v);
  else window.localStorage.removeItem(FONT_SCALE_KEY);
  applyFontScaleToBody(scale);
  emitPreferencesChanged();
}

// 다른 컴포넌트에 prefs 변경 알림 — HomeScreen 등 자체 state 가진 곳들이 listen.
const PREFERENCES_EVENT = "locaville:preferences-changed";

function emitPreferencesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT));
}

/** 다른 화면에서 prefs 갱신 알림 받기. cleanup 함수 반환. */
export function onPreferencesChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PREFERENCES_EVENT, handler);
  return () => window.removeEventListener(PREFERENCES_EVENT, handler);
}

/** body 의 data-large-text 속성을 현재 scale 에 맞춰 갱신. mount 시 + 변경 시 호출. */
export function applyFontScaleToBody(scale: FontScale): void {
  if (typeof document === "undefined") return;
  const v = FONT_SCALE_TO_VALUE[scale];
  if (v) document.body.setAttribute("data-large-text", v);
  else document.body.removeAttribute("data-large-text");
}

// ---------- 간단하게 보기 ----------
// ON  = 글자 자동으로 크게 (xlarge) + 홈 부가 요소 숨김 (더 고령 70-80대 타겟)
// OFF = 기본 (60대 타겟, 모든 요소 노출)
//
// 글자 크기는 simple mode 와 직결 — 별도 chip 옵션 없음. 단순한 1-tap 토글.

const SIMPLE_MODE_KEY = "simple_mode";

export function isSimpleMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIMPLE_MODE_KEY) === "1";
}

export function setSimpleMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  if (enabled) {
    window.localStorage.setItem(SIMPLE_MODE_KEY, "1");
    setFontScale("xlarge"); // 내부에서 emit 함
  } else {
    window.localStorage.removeItem(SIMPLE_MODE_KEY);
    setFontScale("normal");
  }
}

// ---------- 음성 안내 ON/OFF ----------
// requestOpenAiTts 에서 "0" 이면 호출 skip (network 비용 절감 + 청각 접근성 옵션).

const VOICE_GUIDE_KEY = "voice_guide_enabled";

export function isVoiceGuideEnabled(): boolean {
  if (typeof window === "undefined") return true;
  // 기본값 ON (default 가 enabled). 명시적으로 "0" 일 때만 OFF.
  return window.localStorage.getItem(VOICE_GUIDE_KEY) !== "0";
}

export function setVoiceGuideEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VOICE_GUIDE_KEY, enabled ? "1" : "0");
  emitPreferencesChanged();
}

// ---------- 알림 시간대 ----------
// HH:MM 문자열로 저장. default [00:00, 23:59] = 항상.
// LocavilleApp 의 unread badge 가 이 window 밖이면 0 으로 처리.

const NOTIF_START_KEY = "notif_window_start";
const NOTIF_END_KEY = "notif_window_end";
const NOTIF_DEFAULT_START = "00:00";
const NOTIF_DEFAULT_END = "23:59";

export function getNotifWindow(): { start: string; end: string } {
  if (typeof window === "undefined") return { start: NOTIF_DEFAULT_START, end: NOTIF_DEFAULT_END };
  return {
    start: window.localStorage.getItem(NOTIF_START_KEY) || NOTIF_DEFAULT_START,
    end: window.localStorage.getItem(NOTIF_END_KEY) || NOTIF_DEFAULT_END,
  };
}

export function setNotifWindow(start: string, end: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTIF_START_KEY, start);
  window.localStorage.setItem(NOTIF_END_KEY, end);
  emitPreferencesChanged();
}

/** 현재 시각이 알림 window 안인지. 자정 넘는 window (예: 22:00~06:00) 도 지원. */
export function isInNotifWindow(now: Date = new Date()): boolean {
  const { start, end } = getNotifWindow();
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return true; // 동일 시각 = window 의미 없음 → 항상 허용
  if (s < e) return cur >= s && cur <= e;
  // 자정 넘기 (예: 22:00~06:00)
  return cur >= s || cur <= e;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

// ---------- 약관 동의 ----------
// 첫 진입 시 TermsAgreementModal 띄울지 결정.
// 동의 시 timestamp 저장. version bump 시 재동의 받으려면 key 의 v1 → v2.

const TOS_AGREED_KEY = "tos_agreed_v1";
const TOS_LOCATION_KEY = "tos_location_agreed";

export function hasAgreedToTerms(): boolean {
  if (typeof window === "undefined") return true; // SSR — 모달 안 띄움
  return !!window.localStorage.getItem(TOS_AGREED_KEY);
}

export function recordTermsAgreement(locationAgreed: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOS_AGREED_KEY, new Date().toISOString());
  window.localStorage.setItem(TOS_LOCATION_KEY, locationAgreed ? "1" : "0");
}

export function hasAgreedToLocation(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(TOS_LOCATION_KEY) === "1";
}
