"use client";

/** 앱 진입 시 스플래시 화면. 짧은 지연 후 자동으로 로그인 화면으로 이동. */

import { useEffect, useRef } from "react";
import Image from "next/image";

type Screen =
  | "home" | "voiceInput" | "manualInput" | "photoInput" | "saveComplete"
  | "journal" | "business" | "help" | "settings" | "journalDetail"
  | "businessDetail" | "splash" | "loginSelect" | "manualLogin";

interface SplashScreenProps {
  navigate: (screen: Screen) => void;
}

export default function SplashScreen({ navigate }: SplashScreenProps) {
  // 자동 이동 — ref 로 navigate 최신 값 유지 + useEffect dep [] 로 mount 시 1회만 setTimeout.
  // (이전엔 dep [navigate] 라 매 re-render 마다 cleanup → 무한 reset.)
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  });
  useEffect(() => {
    const t = window.setTimeout(() => navigateRef.current("loginSelect"), 2000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen px-8"
      style={{ background: "#ffffff" }}
    >
      <Image
        src="/logo.png"
        alt="저탄마을 로고"
        width={220}
        height={220}
        className="object-contain"
        priority
      />
      {/* 브랜드 타이틀 — 헤더와 동일 스타일 (--primary + extrabold + tracking) */}
      <h1
        className="text-4xl mt-4"
        style={{ color: "var(--primary)", fontWeight: 800, letterSpacing: "-0.02em" }}
      >
        저탄마을
      </h1>
      <p
        className="text-base font-bold text-center leading-relaxed mt-3"
        style={{ color: "var(--ink-soft)" }}
      >
        마을이 함께 기록하는 친환경 농업
      </p>

      <button
        onClick={() => navigate("loginSelect")}
        className="mt-16 text-sm font-bold underline underline-offset-4 active:opacity-70"
        style={{ color: "var(--muted-2)" }}
      >
        시작하기
      </button>
    </div>
  );
}
