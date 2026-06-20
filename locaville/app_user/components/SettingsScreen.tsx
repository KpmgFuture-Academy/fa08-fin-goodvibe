"use client";

/** SettingsScreen — 내 정보 · 글자 크기 · 화면 보기 방식 · 음성안내 · 알림(방해금지) · 고객센터 · 약관 · 로그아웃.
 *  접근성/알림 설정은 preferences(localStorage)에 즉시 영속화. */

import { useState } from "react";
import { ChevronLeft, ChevronRight, User, Type, Volume2, VolumeX, Bell, Moon, Headphones, Phone, MessageCircle, FileText, LogOut, Check } from "lucide-react";
import type { Business } from "./BusinessScreens";
import TermsDocModal from "./TermsDocModal";
import {
  isVoiceGuideEnabled, setVoiceGuideEnabled,
  getNotifWindow, setNotifWindow,
} from "@/lib/preferences";
import { TERMS_KEYS, type TermsKey } from "@/lib/terms-content";

interface SettingsScreenProps {
  userName: string;
  villageLabel: string;       // "서호마을 · 저탄소농법선도반"
  businesses: Business[];
  uiMode: "easy" | "standard";
  onChangeMode: (m: "easy" | "standard") => void;
  navigate: (screen: string) => void;
  onOpenBusiness: (b: Business) => void;
  onLogout: () => void;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${on ? "bg-[var(--lv-primary)]" : "bg-[var(--lv-line)]"}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-[26px]" : "translate-x-1"}`} />
    </button>
  );
}

const NOTIF_ITEMS = [
  { id: "base", label: "기본 일정 알림" },
  { id: "gongik", label: "공익직불제 알림" },
  { id: "lowcarbon", label: "저탄소 농업 프로그램 알림" },
  { id: "eco", label: "친환경 인증 준비 알림" },
] as const;

const DEFAULT_DND = { start: "22:00", end: "07:00" };
const isDndOn = (w: { start: string; end: string }) => !(w.start === "00:00" && w.end === "23:59");

export default function SettingsScreen({ userName, villageLabel, businesses, uiMode, onChangeMode, navigate, onOpenBusiness, onLogout }: SettingsScreenProps) {
  const [voiceGuide, setVoiceGuideState] = useState(() => isVoiceGuideEnabled());
  const [notifs, setNotifs] = useState<Record<string, boolean>>({ base: true, gongik: true, lowcarbon: true, eco: false });
  const [window_, setWindow] = useState(() => getNotifWindow());
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [reviewDoc, setReviewDoc] = useState<TermsKey | null>(null);

  const dndOn = isDndOn(window_);
  function applyVoice(v: boolean) { setVoiceGuideState(v); setVoiceGuideEnabled(v); }
  function applyWindow(w: { start: string; end: string }) { setWindow(w); setNotifWindow(w.start, w.end); }

  const card = "mx-4 overflow-hidden rounded-2xl border border-[var(--lv-line-soft)] bg-[var(--lv-card)] shadow-[0_1px_2px_rgba(31,42,31,0.04),0_6px_14px_rgba(31,42,31,0.04)]";
  const Section = ({ Icon, text }: { Icon: React.ComponentType<{ size?: number; className?: string }>; text: string }) => (
    <div className="flex items-center gap-2 border-b border-[var(--lv-line-soft)] p-4"><Icon size={16} className="text-[color:var(--lv-primary)]" /><h2 className="text-[15px] font-extrabold text-[color:var(--lv-ink)]">{text}</h2></div>
  );

  return (
    <div className="lv-stagger relative flex min-h-full flex-col gap-5 bg-[var(--lv-bg)] pb-10">
      <div className="flex items-center gap-3 px-4 pb-1 pt-[18px]">
        <button onClick={() => navigate("home")} aria-label="뒤로" className="rounded-xl border border-[var(--lv-line)] bg-[var(--lv-bg-soft)] p-2.5"><ChevronLeft size={24} className="text-[color:var(--lv-ink)]" /></button>
        <h1 className="text-[24px] font-extrabold text-[color:var(--lv-ink)]">설정</h1>
      </div>

      {/* 내 정보 */}
      <div className={`${card} p-4`}>
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-full bg-[var(--lv-primary)] p-3"><User size={24} className="text-white" /></div>
          <div className="min-w-0">
            <p className="text-[18px] font-extrabold text-[color:var(--lv-ink)]">{userName}</p>
            <p className="text-[14px] font-bold text-[color:var(--lv-muted)]">{villageLabel}</p>
          </div>
        </div>
        <div className="rounded-xl bg-[var(--lv-bg-soft)] px-1.5 py-2.5">
          <p className="mx-1.5 mb-1 text-[12px] font-bold text-[color:var(--lv-muted)]">참여 사업 (눌러서 자세히 보기)</p>
          {businesses.map((b) => (
            <button key={b.prj_id} onClick={() => onOpenBusiness(b)} className="flex w-full items-center justify-between gap-2 px-1.5 py-2 text-left">
              <span className="text-[15px] font-bold leading-snug text-[color:var(--lv-ink)] [word-break:keep-all]">{b.name}</span>
              <ChevronRight size={20} className="text-[color:var(--lv-ink-soft)]" />
            </button>
          ))}
        </div>
      </div>

      {/* 화면 보기 방식 — 가독성(글자 크게)은 '쉬운 화면'이 담당. */}
      <div className={card}>
        <Section Icon={Type} text="화면 보기 방식" />
        {([["standard", "표준 화면", "오늘 할 일을 한눈에, 빠르게"], ["easy", "쉬운 화면", "큰 글씨로, 한 번에 하나씩 천천히"]] as const).map(([key, title, sub], i) => {
          const on = uiMode === key;
          return (
            <div key={key} role="button" tabIndex={0} onClick={() => onChangeMode(key)}
              className={`flex w-full cursor-pointer items-center gap-3 p-4 ${i === 0 ? "border-b border-[var(--lv-line-soft)]" : ""} ${on ? "bg-[var(--lv-accent-soft)]" : ""}`}>
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${on ? "bg-[var(--lv-primary)]" : "border-2 border-[var(--lv-line)]"}`}>{on && <Check size={18} className="text-white" />}</div>
              <div className="min-w-0 flex-1">
                <span className="block text-[17px] font-extrabold text-[color:var(--lv-ink)]">{title}</span>
                <span className="mt-0.5 block text-[13px] text-[color:var(--lv-muted)]">{sub}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 음성 안내 */}
      <div className={card}>
        <Section Icon={Volume2} text="음성 안내" />
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-2">
            {voiceGuide ? <Volume2 size={16} className="text-[color:var(--lv-primary)]" /> : <VolumeX size={16} className="text-[color:var(--lv-muted)]" />}
            <div className="min-w-0"><span className="block text-[16px] text-[color:var(--lv-ink)]">음성 안내</span><span className="text-[12px] text-[color:var(--lv-muted)]">말로 도와드려요</span></div>
          </div>
          <Toggle on={voiceGuide} onClick={() => applyVoice(!voiceGuide)} />
        </div>
      </div>

      {/* 알림 설정 */}
      <div className={card}>
        <Section Icon={Bell} text="알림 설정" />
        {/* 방해금지 시간대 */}
        <div className="border-b border-[var(--lv-line-soft)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Moon size={16} className="text-[color:var(--lv-primary)]" />
              <div className="min-w-0"><span className="block text-[16px] text-[color:var(--lv-ink)]">방해금지 시간대</span><span className="text-[12px] text-[color:var(--lv-muted)]">이 시간엔 알림 표시를 쉬어요</span></div>
            </div>
            <Toggle on={dndOn} onClick={() => applyWindow(dndOn ? { start: "00:00", end: "23:59" } : DEFAULT_DND)} />
          </div>
          {dndOn && (
            <div className="mt-3 flex items-center gap-2">
              <input type="time" value={window_.start} onChange={(e) => applyWindow({ ...window_, start: e.target.value })}
                className="flex-1 rounded-xl border border-[var(--lv-line)] bg-[var(--lv-bg-soft)] px-3 py-2.5 text-center text-[16px] font-bold text-[color:var(--lv-ink)] outline-none" />
              <span className="text-[14px] font-bold text-[color:var(--lv-muted)]">부터</span>
              <input type="time" value={window_.end} onChange={(e) => applyWindow({ ...window_, end: e.target.value })}
                className="flex-1 rounded-xl border border-[var(--lv-line)] bg-[var(--lv-bg-soft)] px-3 py-2.5 text-center text-[16px] font-bold text-[color:var(--lv-ink)] outline-none" />
              <span className="text-[14px] font-bold text-[color:var(--lv-muted)]">까지</span>
            </div>
          )}
        </div>
        {NOTIF_ITEMS.map((item, i) => (
          <div key={item.id} className={`flex items-center justify-between p-4 ${i < NOTIF_ITEMS.length - 1 ? "border-b border-[var(--lv-line-soft)]" : ""}`}>
            <span className="text-[16px] text-[color:var(--lv-ink)]">{item.label}</span>
            <Toggle on={!!notifs[item.id]} onClick={() => setNotifs((p) => ({ ...p, [item.id]: !p[item.id] }))} />
          </div>
        ))}
      </div>

      {/* 고객센터 */}
      <div className={card}>
        <Section Icon={Headphones} text="고객센터" />
        {([[Headphones, "고객센터 연결하기"], [Phone, "전화 문의"], [MessageCircle, "카카오톡 문의"]] as const).map(([Icon, label], i) => (
          <div key={label} className={`flex items-center justify-between p-4 ${i < 2 ? "border-b border-[var(--lv-line-soft)]" : ""}`}>
            <div className="flex items-center gap-2"><Icon size={16} className="text-[color:var(--lv-muted)]" /><span className="text-[16px] text-[color:var(--lv-ink)]">{label}</span></div>
            <ChevronRight size={20} className="text-[color:var(--lv-muted)]" />
          </div>
        ))}
      </div>

      {/* 약관 — 눌러서 내용 보기 */}
      <div className={card}>
        <Section Icon={FileText} text="약관 및 정책" />
        {TERMS_KEYS.map((doc, i) => (
          <button key={doc} onClick={() => setReviewDoc(doc)} className={`flex w-full items-center justify-between p-4 text-left ${i < TERMS_KEYS.length - 1 ? "border-b border-[var(--lv-line-soft)]" : ""}`}>
            <span className="text-[16px] text-[color:var(--lv-ink)] [word-break:keep-all]">{doc}</span><ChevronRight size={20} className="text-[color:var(--lv-muted)]" />
          </button>
        ))}
      </div>

      <div className="mx-4">
        <button onClick={() => setLogoutOpen(true)} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border border-[var(--lv-line)] bg-white text-[16px] font-bold text-[color:var(--lv-danger)]"><LogOut size={20} />로그아웃</button>
      </div>

      {logoutOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-[320px] rounded-2xl bg-white p-6 text-center shadow-[0_16px_40px_rgba(0,0,0,0.2)]">
            <p className="mb-2 text-[18px] font-extrabold text-[color:var(--lv-ink)]">로그아웃하시겠어요?</p>
            <p className="mb-5 text-[14px] text-[color:var(--lv-muted)]">앱을 다시 사용하려면 로그인해 주세요.</p>
            <div className="flex gap-2.5">
              <button onClick={() => setLogoutOpen(false)} className="flex-1 rounded-2xl border border-[var(--lv-line)] bg-[var(--lv-bg-soft)] py-3.5 text-[15px] font-bold text-[color:var(--lv-ink)]">취소</button>
              <button onClick={() => { setLogoutOpen(false); onLogout(); }} className="flex-1 rounded-2xl bg-[var(--lv-primary)] py-3.5 text-[15px] font-bold text-white">확인</button>
            </div>
          </div>
        </div>
      )}

      {/* 약관 재열람 — 약관별 화면 정중앙 팝업 (따로따로). */}
      <TermsDocModal docKey={reviewDoc} onClose={() => setReviewDoc(null)} />
    </div>
  );
}
