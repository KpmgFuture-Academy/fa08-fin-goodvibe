"use client";

/** 로그인 방법 선택 화면 — 카카오/문자 인증/직접 로그인 등 진입점 (시연용, 실제 인증 없음). */

import Image from "next/image";
import { resetSampleUser } from "@/lib/sample-user-context";

type Screen =
  | "home" | "voiceInput" | "manualInput" | "photoInput" | "saveComplete"
  | "journal" | "business" | "help" | "settings" | "journalDetail"
  | "businessDetail" | "splash" | "loginSelect" | "manualLogin";

interface LoginSelectScreenProps {
  navigate: (screen: Screen) => void;
}

export default function LoginSelectScreen({ navigate }: LoginSelectScreenProps) {
  // 카카오 = 데모 기본 농가(김영수)로 reset. localStorage 정리 후 reload 로 깨끗하게
  // 모든 화면이 새 farmer_id 로 다시 fetch 하도록 한다.
  function handleKakaoLogin() {
    resetSampleUser();
    if (typeof window !== "undefined") {
      // reload 후 LocavilleApp 의 currentScreen 초기값을 즉시 home 으로 만드는 flag.
      // splash 가 한 frame 깜빡이는 것 방지.
      window.sessionStorage.setItem("locaville:skip-splash", "1");
      window.location.reload();
    } else {
      navigate("home");
    }
  }

  return (
    // 계층적 구조 + 하단 풍경 일러스트.
    // 상단 60%: 흰 배경 brand area (로고 + 타이틀 + 부제).
    // 하단에 바로 풍경 SVG 일러스트로 부드러운 transition (저탄마을 = 농촌 톤).
    // 액션 영역은 그 아래 흰 배경 위에 자연스럽게.
    <div className="flex flex-col min-h-[100dvh]" style={{ background: "#ffffff" }}>
      {/* === 상단 brand area — contents 를 brand 영역 하단(일러스트 바로 위)에 정렬.
          기존 `justify-center` 는 화면 1/4 지점에 떠 있던 느낌. `justify-end + pb` 로 내림. === */}
      <div className="flex-1 flex flex-col items-center justify-end px-6 pt-12 pb-10 text-center">
        <Image
          src="/logo.png"
          alt="저탄마을 로고"
          width={148}
          height={148}
          className="object-contain"
          priority
        />
        <h1
          className="mt-2"
          style={{
            color: "var(--primary)",
            fontSize: 36,
            fontWeight: 800,
            letterSpacing: "-0.025em",
          }}
        >
          저탄마을
        </h1>
        <p
          className="mt-3 leading-relaxed"
          style={{ color: "var(--ink-soft)", fontSize: 15, fontWeight: 500 }}
        >
          마을이 함께 기록하는<br />친환경 농업
        </p>
      </div>

      {/* === 풍경 일러스트 (인라인 SVG) — brand 와 action 사이 visual 연결고리.
          height 180 으로 키워 윗 박스 시각 무게 확보. viewBox 도 비율 맞춰 조정. === */}
      <div className="w-full" style={{ marginBottom: -1 /* 1px sub-pixel gap 방지 */ }}>
        <svg
          viewBox="0 0 390 180"
          preserveAspectRatio="none"
          width="100%"
          height="180"
          aria-hidden="true"
          style={{ display: "block" }}
        >
          {/* 멀리 산 — 진초록 약간 어두움 */}
          <path
            d="M0,115 L60,65 L130,100 L200,50 L270,90 L340,68 L390,85 L390,180 L0,180 Z"
            fill="var(--accent-dark, #1c4a36)"
            opacity="0.18"
          />
          {/* 중간 언덕 — primary 톤 */}
          <path
            d="M0,140 L80,105 L160,128 L240,98 L320,122 L390,108 L390,180 L0,180 Z"
            fill="var(--primary)"
            opacity="0.28"
          />
          {/* 앞 논두렁 — accent-soft */}
          <path
            d="M0,160 L100,140 L200,156 L300,142 L390,154 L390,180 L0,180 Z"
            fill="var(--primary)"
            opacity="0.55"
          />
          {/* 작은 태양 — 오른쪽 상단 */}
          <circle cx="320" cy="38" r="16" fill="#f4c869" opacity="0.85" />
        </svg>
      </div>

      {/* === 하단 액션 영역 ===
          - shrink-0 + 작은 pt 로 일러스트와 자연스레 이어지게 (큰 빈 공간 제거).
          - 두 버튼 묶음을 좁은 간격으로 두어 한 단위로 인지되게.
          - 카카오 = primary CTA (노란 + 그림자), 직접 로그인 = primary 텍스트 버튼 (보조). */}
      <div
        className="shrink-0 flex flex-col px-6 pt-10 pb-12"
        style={{ background: "#ffffff" }}
      >
        <div className="w-full flex flex-col" style={{ rowGap: 16 }}>
          {/* Kakao — 그림자로 살짝 떠있는 느낌, 모서리 살짝 더 둥글게(16) */}
          <button
            onClick={handleKakaoLogin}
            className="w-full flex items-center justify-center gap-2 active:translate-y-px active:opacity-95"
            style={{
              backgroundColor: "#FEE500",
              color: "#191919",
              minHeight: 56,
              borderRadius: 16,
              fontSize: 17,
              fontWeight: 700,
              boxShadow: "0 6px 16px rgba(254,229,0,0.30), 0 2px 4px rgba(0,0,0,0.04)",
              transition: "transform 0.06s ease",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
              <path
                d="M11 2C6.03 2 2 5.36 2 9.5c0 2.67 1.71 5.01 4.3 6.36l-1.1 4.1 4.78-3.15c.33.04.67.06 1.02.06 4.97 0 9-3.36 9-7.5S15.97 2 11 2z"
                fill="#191919"
              />
            </svg>
            카카오톡으로 로그인하기
          </button>

          {/* Manual login — primary 색 텍스트 버튼 (보조 위계).
              outline / 배경 없이 'underline-on-press' 톤으로 깔끔. */}
          <button
            onClick={() => navigate("manualLogin")}
            className="w-full active:opacity-60"
            style={{
              backgroundColor: "transparent",
              color: "var(--primary)",
              minHeight: 48,
              fontSize: 15,
              fontWeight: 700,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            직접 로그인하기
          </button>
        </div>
      </div>
    </div>
  );
}
