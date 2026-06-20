"use client";

/** 설정 화면 — 글자 크기, 알림, 데이터 소스 등 사용자 설정 (시연 단계, 일부는 placeholder). */

import { useEffect, useState } from "react";
import {
  User,
  Bell,
  Lock,
  FileText,
  LogOut,
  X,
  ChevronRight,
  Phone,
  MessageCircle,
  Headphones,
  Type,
  Volume2,
  VolumeX,
  Clock,
} from "lucide-react";
import { SAMPLE_USER_CONTEXT } from "@/lib/sample-user-context";
import { fetchCurrentUserProfile, type UserProfile, type VillageProfile } from "@/lib/user-profile-service";
import { fetchFarmerProjects, type FarmerProject } from "@/lib/business-service";
import { TERMS_CONTENTS, TERMS_KEYS, type TermsKey } from "@/lib/terms-content";
import {
  isSimpleMode,
  setSimpleMode,
  isVoiceGuideEnabled,
  setVoiceGuideEnabled,
  getNotifWindow,
  setNotifWindow,
} from "@/lib/preferences";

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

interface SettingsScreenProps {
  navigate: (screen: Screen) => void;
}

const NOTIFICATION_ITEMS = [
  { id: "base", label: "기본 일정 알림" },
  { id: "gongik", label: "공익직불제 알림" },
  { id: "lowcarbon", label: "저탄소 농업 프로그램 알림" },
  { id: "eco", label: "친환경 인증 준비 알림" },
];

// 약관 텍스트 + 키는 lib/terms-content.ts 에서 import (TermsAgreementModal 과 공유).

export default function SettingsScreen({ navigate }: SettingsScreenProps) {
  const [notifications, setNotifications] = useState<Record<string, boolean>>({
    base: true,
    gongik: true,
    lowcarbon: false,
    eco: false,
  });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [openDoc, setOpenDoc] = useState<TermsKey | null>(null);
  const [contactToast, setContactToast] = useState("");

  // 사용자/마을/참여사업 — backend 에서 조회 (이전엔 하드코딩).
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [village, setVillage] = useState<VillageProfile | null>(null);
  const [projects, setProjects] = useState<FarmerProject[]>([]);

  // ── 접근성 옵션 (localStorage 기반) ──
  const [simpleMode, setSimpleModeState] = useState<boolean>(false);
  const [voiceGuide, setVoiceGuideState] = useState<boolean>(true);
  const [notifStart, setNotifStart] = useState<string>("00:00");
  const [notifEnd, setNotifEnd] = useState<string>("23:59");

  useEffect(() => {
    let mounted = true;
    void fetchCurrentUserProfile(SAMPLE_USER_CONTEXT.farmer_id).then(({ user, village: v }) => {
      if (!mounted) return;
      setProfile(user);
      setVillage(v);
    });
    void fetchFarmerProjects(SAMPLE_USER_CONTEXT.farmer_id).then((rows) => {
      if (mounted) setProjects(rows);
    });
    // mount 시 localStorage 에서 접근성 옵션 로드.
    setSimpleModeState(isSimpleMode());
    setVoiceGuideState(isVoiceGuideEnabled());
    const win = getNotifWindow();
    setNotifStart(win.start);
    setNotifEnd(win.end);
    return () => {
      mounted = false;
    };
  }, []);

  function handleToggleSimpleMode() {
    const next = !simpleMode;
    setSimpleModeState(next);
    setSimpleMode(next); // 글자 크기도 자동 (xlarge / normal) + body 적용
  }

  function handleToggleVoiceGuide() {
    const next = !voiceGuide;
    setVoiceGuideState(next);
    setVoiceGuideEnabled(next);
  }

  function handleNotifChange(start: string, end: string) {
    setNotifStart(start);
    setNotifEnd(end);
    setNotifWindow(start, end);
  }

  // 표시용 fallback — backend 응답 도착 전엔 sample context 의 farmer_name.
  const displayName = profile?.user_name || SAMPLE_USER_CONTEXT.farmer_name;
  const displayVille = village?.ville_name || "마을 정보를 불러오는 중...";
  const displayPhone = profile?.phone_no || "";

  function toggleNotif(id: string) {
    setNotifications((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handlePasswordSubmit() {
    if (password.length >= 4) {
      setUnlocked(true);
      setShowPasswordModal(false);
      setPassword("");
    }
  }

  function handleLogout() {
    setShowLogoutConfirm(false);
    navigate("splash");
  }

  function showContactAlert(type: string) {
    setContactToast(type);
    setTimeout(() => setContactToast(""), 2500);
  }

  return (
    <div className="flex flex-col gap-5 pb-8" style={{ background: "#ffffff", minHeight: "100vh" }}>
      {/* Contact Toast */}
      {contactToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background text-sm font-bold px-5 py-3 rounded-2xl shadow-xl text-center">
          {contactToast}
        </div>
      )}

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">비밀번호 확인</h3>
              <button onClick={() => setShowPasswordModal(false)} className="p-1">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">정보를 수정하려면 비밀번호를 입력해주세요.</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호 입력"
              className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-base text-foreground mb-4 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              onClick={handlePasswordSubmit}
              className="w-full bg-primary text-primary-foreground text-base font-bold py-3.5 rounded-xl"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* Logout Confirm Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-xl text-center">
            <p className="text-lg font-bold text-foreground mb-2">로그아웃되었습니다</p>
            <p className="text-sm text-muted-foreground mb-6">앱을 다시 사용하려면 로그인해 주세요.</p>
            <button
              onClick={handleLogout}
              className="w-full bg-primary text-primary-foreground text-base font-bold py-3.5 rounded-xl"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* Full Screen Terms Modal */}
      {openDoc && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center gap-3 px-4 py-4 border-b border-border flex-shrink-0">
            <button
              onClick={() => setOpenDoc(null)}
              className="p-2 rounded-xl bg-secondary active:bg-accent"
            >
              <X className="w-5 h-5 text-foreground" />
            </button>
            <h2 className="text-lg font-bold text-foreground">{openDoc}</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-5">
            <p className="text-base text-foreground leading-relaxed whitespace-pre-wrap">{TERMS_CONTENTS[openDoc]}</p>
          </div>
          <div className="flex-shrink-0 px-4 py-4 border-t border-border">
            <button
              onClick={() => setOpenDoc(null)}
              className="w-full bg-primary text-primary-foreground text-base font-bold py-4 rounded-2xl"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* Title */}
      <div className="px-4 pt-5">
        <h1 className="text-2xl font-bold text-foreground">설정</h1>
      </div>

      {/* My Info Card — backend 에서 조회한 농가/마을/사업 정보 */}
      <div className="mx-4 jt-mobile-card rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-full p-3" style={{ background: "var(--primary)" }}>
            <User className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-foreground">{displayName}</p>
            <p className="text-sm font-bold text-muted-foreground break-keep">
              {displayVille}
            </p>
          </div>
        </div>
        <div className="bg-secondary rounded-xl p-3 mb-3">
          <p className="text-xs font-bold text-muted-foreground mb-1.5">참여 사업</p>
          <div className="flex flex-col gap-1">
            {projects.length === 0 ? (
              <p className="text-sm font-bold text-muted-foreground">참여 중인 사업이 없어요.</p>
            ) : (
              projects.map((p) => (
                <p key={p.prj_id} className="text-sm text-foreground font-bold break-keep">
                  · {p.prj_name}
                </p>
              ))
            )}
          </div>
        </div>
        <p className="text-xs font-bold text-muted-foreground leading-relaxed">
          마을에서 등록한 주소와 참여 사업은 이장님 설정에 따라 일부 수정이 제한될 수 있어요.
        </p>
      </div>

      {/* Edit Info */}
      <div className="mx-4 jt-mobile-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" /> 정보 수정
          </h2>
        </div>
        {unlocked ? (
          <div className="p-4 flex flex-col gap-3">
            <div>
              <label className="text-sm font-bold text-foreground block mb-1.5">본인 이름</label>
              <input
                defaultValue={displayName}
                className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-foreground block mb-1.5">휴대폰 번호</label>
              <input
                defaultValue={displayPhone}
                placeholder="010-0000-0000"
                className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="bg-muted rounded-xl p-3">
              <p className="text-xs text-muted-foreground">수정 불가 항목: 사용자 ID, 주소, 참여 사업 목록</p>
            </div>
            <button className="w-full bg-primary text-primary-foreground text-base font-bold py-3.5 rounded-xl">
              저장하기
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowPasswordModal(true)}
            className="w-full flex items-center justify-between p-4 active:bg-muted"
          >
            <span className="text-base text-foreground">정보 수정하기</span>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Accessibility — 간단하게 보기 (글자 크게 + 화면 단순) + 음성 안내 */}
      <div className="mx-4 jt-mobile-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Type className="w-4 h-4 text-primary" /> 접근성
          </h2>
        </div>

        {/* 간단하게 보기 — 메인 토글. 글자 크기 자동 + 부가 요소 숨김. */}
        <button
          type="button"
          onClick={handleToggleSimpleMode}
          className="w-full px-4 py-4 border-b border-border flex items-center gap-3 active:opacity-90 text-left"
        >
          <div
            className="flex-shrink-0 flex items-center justify-center rounded-2xl"
            style={{
              width: 48,
              height: 48,
              background: simpleMode ? "var(--accent)" : "var(--accent-soft, #e3f0e6)",
              transition: "background 200ms ease",
            }}
          >
            <Type
              className="w-6 h-6"
              style={{ color: simpleMode ? "#ffffff" : "var(--accent-dark)" }}
              strokeWidth={2.4}
            />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-base font-bold text-foreground block">간단하게 보기</span>
            <span className="text-xs block mt-0.5" style={{ color: "var(--muted-foreground, #6b7280)" }}>
              글자가 더 커지고 화면이 단순해져요 (어르신용)
            </span>
          </div>
          <span
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 ${
              simpleMode ? "bg-primary" : "bg-muted"
            }`}
            aria-hidden
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                simpleMode ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </span>
        </button>

        {/* 음성 안내 ON/OFF */}
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2 min-w-0">
            {voiceGuide ? (
              <Volume2 className="w-4 h-4 text-primary flex-shrink-0" />
            ) : (
              <VolumeX className="w-4 h-4 flex-shrink-0" style={{ color: "var(--muted-foreground, #6b7280)" }} />
            )}
            <div className="min-w-0">
              <span className="text-base text-foreground block">음성 안내</span>
              <span className="text-xs" style={{ color: "var(--muted-foreground, #6b7280)" }}>
                AI 가 말로 도와드려요
              </span>
            </div>
          </div>
          <button
            onClick={handleToggleVoiceGuide}
            aria-label="음성 안내 토글"
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
              voiceGuide ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                voiceGuide ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div className="mx-4 jt-mobile-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" /> 알림 설정
          </h2>
        </div>
        {NOTIFICATION_ITEMS.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-4 py-4 border-b border-border last:border-0">
            <span className="text-base text-foreground">{item.label}</span>
            <button
              onClick={() => toggleNotif(item.id)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                notifications[item.id] ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  notifications[item.id] ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        ))}

        {/* 알림 받을 시간대 — native time picker. 자정 넘는 window 도 지원 */}
        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-base text-foreground">알림 받을 시간</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="time"
              value={notifStart}
              onChange={(e) => handleNotifChange(e.target.value, notifEnd)}
              className="flex-1 bg-muted border border-border rounded-xl px-3 py-2.5 text-base text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <span className="text-base font-bold text-foreground">~</span>
            <input
              type="time"
              value={notifEnd}
              onChange={(e) => handleNotifChange(notifStart, e.target.value)}
              className="flex-1 bg-muted border border-border rounded-xl px-3 py-2.5 text-base text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground, #6b7280)" }}>
            이 시간 외에는 알림 배지가 조용히 숨겨져요.
          </p>
        </div>
      </div>

      {/* Customer Service */}
      <div className="mx-4 jt-mobile-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Headphones className="w-4 h-4 text-primary" /> 고객센터
          </h2>
        </div>
        <button
          onClick={() => showContactAlert("고객센터로 연결합니다.")}
          className="w-full flex items-center justify-between px-4 py-4 border-b border-border active:bg-muted"
        >
          <div className="flex items-center gap-2">
            <Headphones className="w-4 h-4 text-muted-foreground" />
            <span className="text-base text-foreground">고객센터 연결하기</span>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
        <button
          onClick={() => showContactAlert("전화 문의: 1588-0000")}
          className="w-full flex items-center justify-between px-4 py-4 border-b border-border active:bg-muted"
        >
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <span className="text-base text-foreground">전화 문의</span>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
        <button
          onClick={() => showContactAlert("카카오톡 채널로 이동합니다.")}
          className="w-full flex items-center justify-between px-4 py-4 active:bg-muted"
        >
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-muted-foreground" />
            <span className="text-base text-foreground">카카오톡 문의</span>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Docs */}
      <div className="mx-4 jt-mobile-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> 약관 및 정책
          </h2>
        </div>
        {TERMS_KEYS.map((doc) => (
          <button
            key={doc}
            onClick={() => setOpenDoc(doc)}
            className="w-full flex items-center justify-between px-4 py-4 border-b border-border last:border-0 active:bg-muted"
          >
            <span className="text-base text-foreground">{doc}</span>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        ))}
      </div>

      {/* Logout */}
      <div className="mx-4">
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full bg-card border border-border text-red-500 font-bold text-base py-4 rounded-2xl flex items-center justify-center gap-2 active:bg-red-50"
        >
          <LogOut className="w-5 h-5" />
          로그아웃
        </button>
      </div>
    </div>
  );
}
