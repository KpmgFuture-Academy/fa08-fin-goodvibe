"use client";

/** LoginSelectScreen — 로그인(카카오) + 안심 문구. 로고 아래에 서비스 가치 한 줄. */

interface LoginSelectScreenProps {
  /** 카카오 로그인 — 보통 모드 선택으로 이동. */
  onLogin: () => void;
  /** 직접 로그인 — ManualLoginScreen 으로 이동. 없으면 onLogin 폴백. */
  onManualLogin?: () => void;
}

export default function LoginSelectScreen({ onLogin, onManualLogin }: LoginSelectScreenProps) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex flex-1 flex-col items-center justify-end px-6 pb-6 pt-12 text-center">
        {/* 로고 — 실제 경로로 교체 (public/logo.png) */}
        <img src="/logo.png" alt="저탄마을" width={150} height={150} className="object-contain" />
        <p className="mt-2 text-[18px] font-bold leading-snug text-[color:var(--lv-ink)] [word-break:keep-all]">오늘 할 일을 알려드리고,<br />사진 한 장으로 기록해요</p>
      </div>

      {/* 풍경 일러스트 */}
      <div className="-mb-px w-full">
        <svg viewBox="0 0 390 170" preserveAspectRatio="none" width="100%" height={160} aria-hidden="true" className="block">
          <path d="M0,115 L60,65 L130,100 L200,50 L270,90 L340,68 L390,85 L390,170 L0,170 Z" fill="var(--lv-accent-dark)" opacity="0.18" />
          <path d="M0,140 L80,105 L160,128 L240,98 L320,122 L390,108 L390,170 L0,170 Z" fill="var(--lv-primary)" opacity="0.28" />
          <path d="M0,160 L100,140 L200,156 L300,142 L390,154 L390,170 L0,170 Z" fill="var(--lv-primary)" opacity="0.55" />
          <circle cx="320" cy="38" r="16" fill="#f4c869" opacity="0.85" />
        </svg>
      </div>

      <div className="flex shrink-0 flex-col gap-3 bg-white px-6 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-6">
        <p className="mb-1 text-center text-[15px] font-bold leading-snug text-[color:var(--lv-ink-soft)]">
          마을 농가 확인을 위해 로그인해요.<br />
          <span className="font-bold text-[color:var(--lv-ink-soft)]">허락 없이 기록을 저장하지 않아요.</span>
        </p>
        <button onClick={onLogin} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#FEE500] text-[17px] font-bold text-[#191919] shadow-[0_2px_8px_rgba(31,42,31,0.08)]">
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none"><path d="M11 2C6.03 2 2 5.36 2 9.5c0 2.67 1.71 5.01 4.3 6.36l-1.1 4.1 4.78-3.15c.33.04.67.06 1.02.06 4.97 0 9-3.36 9-7.5S15.97 2 11 2z" fill="#191919" /></svg>
          카카오톡으로 로그인하기
        </button>
        <button onClick={onManualLogin || onLogin} className="min-h-[52px] w-full rounded-2xl border border-[var(--lv-line)] bg-white text-[16px] font-extrabold text-[color:var(--lv-primary)]">직접 로그인하기</button>
      </div>
    </div>
  );
}

/* Claude Code: onLogin = 카카오 인증 후 첫 진입이면 ModeChooser, 아니면 home.
   인증은 인지 테스트 없는 OAuth(WCAG 3.3.8 충족). */
