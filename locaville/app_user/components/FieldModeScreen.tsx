"use client";

/**
 * FieldModeScreen — Field Mode 제안 (포트폴리오/실험용 프레젠테이션 컴포넌트).
 * 아직 어떤 라우트에도 연결되어 있지 않습니다 — 기존 기능·라우팅에 영향 없음.
 *
 * 콘셉트: 논밭 현장에서 장갑 낀 손, 강한 햇빛, 한 손 조작을 가정한 초저밀도 모드.
 * Adaptive Field Interface 의 세 번째 밀도 단계: Focus(쉬운) → Overview(표준) → Field(현장).
 *  - 행동은 단 두 개: 사진(증빙)과 음성(기록). 화면 절반씩을 차지하는 초대형 CTA.
 *  - 본문 20px+, CTA 라벨 24px, 터치 타깃은 화면의 40% 이상 — 보지 않고도 누를 수 있는 크기.
 *  - 햇빛 가독성: 딥 그린(흰 글자 9.9:1)과 흰 카드(잉크 15.9:1)의 최고 대비 조합만 사용.
 *
 * 연결 방법(한 줄): LocavilleApp 의 screen 분기에
 *   {screen === "fieldMode" && <FieldModeScreen navigate={navigate} onPhoto={...} onVoice={...} />}
 * 를 추가하면 됩니다. 핸들러는 기존 photoInput/voiceInput 진입 콜백을 그대로 전달하세요.
 */

import { Camera, Mic, ChevronLeft, PhoneCall } from "lucide-react";

export default function FieldModeScreen({
  navigate, onPhoto, onVoice, onHelp, taskName,
}: {
  navigate?: (screen: string) => void;
  onPhoto?: () => void;
  onVoice?: () => void;
  onHelp?: () => void;
  /** 오늘 현장에서 할 일 한 줄 (예: "농자재 영수증 찍기"). 없으면 일반 문구. */
  taskName?: string;
}) {
  return (
    <div className="flex h-full flex-col gap-3 bg-[var(--lv-bg)] px-5 pb-6 pt-4">
      {/* 시스템 라벨 + 오늘 현장 작업 — Focus Mode 와 동일한 위계 문법 */}
      <header className="shrink-0 px-0.5">
        <p className="text-[13px] font-semibold tracking-[0.02em] text-[color:var(--lv-ink-soft)]">오늘 현장에서 할 일</p>
        <h1 className="mt-1 text-[28px] font-bold leading-snug tracking-tight text-[color:var(--lv-ink)] [word-break:keep-all]">
          {taskName || "무엇을 남기시겠어요?"}
        </h1>
      </header>

      {/* 초대형 카메라 CTA — 화면의 가장 큰 면적 */}
      <button onClick={onPhoto}
        className="flex min-h-[220px] flex-[1.3] flex-col items-center justify-center gap-3 rounded-[28px] bg-[var(--lv-primary)] text-white active:translate-y-px">
        <Camera size={52} strokeWidth={1.8} />
        <span className="text-[26px] font-bold tracking-tight">{taskName ? "영수증 촬영하기" : "사진 찍기"}</span>
        <span className="text-[17px] font-medium text-[color:var(--lv-on-dark-soft)] [word-break:keep-all]">증빙 사진을 바로 보냅니다</span>
      </button>

      {/* 음성 기록 CTA */}
      <button onClick={onVoice}
        className="flex min-h-[150px] flex-1 flex-col items-center justify-center gap-2.5 rounded-[28px] bg-[var(--lv-card)] text-[color:var(--lv-ink)] shadow-[0_2px_8px_rgba(23,35,27,0.05)] active:translate-y-px">
        <Mic size={42} strokeWidth={1.8} className="text-[color:var(--lv-primary)]" />
        <span className="text-[24px] font-bold tracking-tight">말로 기록하기</span>
        <span className="text-[16px] font-medium text-[color:var(--lv-ink-soft)] [word-break:keep-all]">“비료 줬어요”처럼 말하면 돼요</span>
      </button>

      {/* 도움 요청 — outline secondary (64px) */}
      <button onClick={onHelp}
        className="flex min-h-[64px] w-full shrink-0 items-center justify-center gap-2.5 rounded-[20px] border-[1.5px] border-[var(--lv-primary)] bg-[var(--lv-card)] text-[19px] font-bold text-[color:var(--lv-primary)] active:translate-y-px">
        <PhoneCall size={22} strokeWidth={2} /> 도움 요청하기
      </button>

      {/* 돌아가기 — 보조 텍스트 동작 (48px 타깃 유지) */}
      {navigate && (
        <button onClick={() => navigate("home")}
          className="inline-flex min-h-[48px] w-full shrink-0 items-center justify-center gap-1 text-[16px] font-semibold text-[color:var(--lv-ink-soft)]">
          <ChevronLeft size={18} className="shrink-0" /> 오늘 화면으로 돌아가기
        </button>
      )}
    </div>
  );
}
