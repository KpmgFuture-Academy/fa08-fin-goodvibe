"use client";

/** 직접 로그인 화면 (시연 전용, 실제 인증 없음).
 *  아이디만 채우면 비밀번호는 어떤 값이든 통과 — 입력한 ID 로 데모 컨텍스트를 교체하고
 *  page reload 로 모든 화면이 새 farmer_id 기준으로 다시 fetch 하게 한다.
 *
 *  backend.identity_repository 는 login_id / amo_regno / farmer_regno / user_no 중
 *  무엇이든 받아 정규화하므로 시드 농가의 어느 식별자를 쳐도 동작.
 */

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { setSampleUser } from "@/lib/sample-user-context";

type Screen =
  | "home" | "voiceInput" | "manualInput" | "photoInput" | "saveComplete"
  | "journal" | "business" | "help" | "settings" | "journalDetail"
  | "businessDetail" | "splash" | "loginSelect" | "manualLogin";

interface ManualLoginScreenProps {
  navigate: (screen: Screen) => void;
}

export default function ManualLoginScreen({ navigate }: ManualLoginScreenProps) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");

  function handleLogin() {
    const trimmedId = id.trim();
    if (!trimmedId) {
      window.alert("아이디를 입력해 주세요.");
      return;
    }
    // 비밀번호는 의도적으로 검증하지 않음 (데모용).
    setSampleUser({ farmer_id: trimmedId });
    if (typeof window !== "undefined") {
      // reload 후 splash 건너뛰고 즉시 home 진입.
      window.sessionStorage.setItem("locaville:skip-splash", "1");
      window.location.reload();
    } else {
      navigate("home");
    }
  }

  return (
    <div className="flex flex-col min-h-screen px-6 pt-5 pb-10">
      {/* Back */}
      <button
        onClick={() => navigate("loginSelect")}
        className="self-start p-2 rounded-xl bg-secondary active:bg-accent mb-4"
      >
        <ChevronLeft className="w-6 h-6 text-primary" />
      </button>

      <h1 className="text-2xl font-bold text-foreground mb-1">직접 로그인</h1>
      <p className="text-sm text-muted-foreground mb-8">아이디와 비밀번호를 입력해주세요.</p>

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-sm font-bold text-foreground block mb-1.5">아이디</label>
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="아이디 입력"
            className="w-full bg-muted border border-border rounded-xl px-4 py-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div>
          <label className="text-sm font-bold text-foreground block mb-1.5">비밀번호</label>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="비밀번호 입력"
            className="w-full bg-muted border border-border rounded-xl px-4 py-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <button
          onClick={handleLogin}
          className="w-full py-4 rounded-2xl text-lg font-bold text-white mt-2 active:opacity-90"
          style={{ backgroundColor: "#2f6d4f" }}
        >
          로그인
        </button>
      </div>

      {/* Secondary links */}
      <div className="flex items-center justify-center gap-6 mt-6">
        <button className="text-sm text-muted-foreground underline underline-offset-2">
          아이디 찾기
        </button>
        <span className="text-muted-foreground">|</span>
        <button className="text-sm text-muted-foreground underline underline-offset-2">
          비밀번호 찾기
        </button>
      </div>
    </div>
  );
}
