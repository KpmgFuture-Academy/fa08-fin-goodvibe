"use client";

/**
 * ManualLoginScreen — 시연용 직접 로그인 화면.
 *
 * - 아이디 + 비밀번호 입력 (비번은 어떤 값이든 통과 — backend identity_repository 가
 *   login_id 기반으로 정규화).
 * - 알려진 시연 ID 는 자동으로 한글 이름 매핑 (홈 화면 인사말 자연스럽게).
 * - 로그인 후 setSampleUser → localStorage 저장 → reload → home 진입.
 */

import { useState } from "react";
import { ChevronLeft, User, Lock, Loader } from "lucide-react";
import { setSampleUser } from "@/lib/sample-user-context";

interface ManualLoginScreenProps {
  /** 뒤로 가기 — LoginSelectScreen 으로 복귀. */
  onBack: () => void;
}

// 시연용 알려진 ID → 한글 이름 매핑. 다른 ID 도 입력 가능 (ID 가 곧 이름으로 표시).
const KNOWN_DEMO_USERS: Record<string, string> = {
  chanho0123: "박찬호",
  sunnypark: "박순선",
  ylkim: "김영리",
  "ys.kim": "김영수",
  "kimys68": "김영수",
  "1110000002": "김영수",
  "1110000004": "박찬호",
  "1110000005": "박순선",
  "1110000006": "김영리",
};

export default function ManualLoginScreen({ onBack }: ManualLoginScreenProps) {
  const [farmerId, setFarmerId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = farmerId.trim().length > 0 && !submitting;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    const id = farmerId.trim();
    const name = KNOWN_DEMO_USERS[id] || KNOWN_DEMO_USERS[id.toLowerCase()] || id;
    try {
      setSampleUser({ farmer_id: id, farmer_name: name });
      // localStorage 저장 직후 reload — page.tsx 의 SAMPLE_USER_CONTEXT 가 새 값으로 hydrate.
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch {
      setError("로그인을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* 헤더 */}
      <div className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          className="rounded-xl border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] p-2"
        >
          <ChevronLeft size={22} className="text-[color:var(--lv-ink)]" />
        </button>
        <h1 className="text-[20px] font-extrabold text-[color:var(--lv-ink)]">직접 로그인</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-2">
        <p className="mb-5 text-[15px] font-bold text-[color:var(--lv-ink-soft)] [word-break:keep-all]">
          마을에 등록된 아이디로 들어가세요.
        </p>

        {/* 아이디 */}
        <label className="mb-1 text-[14px] font-bold text-[color:var(--lv-ink-soft)]">아이디</label>
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-[var(--lv-line)] bg-white px-3.5 py-3 focus-within:border-[color:var(--lv-primary)]">
          <User size={20} className="shrink-0 text-[color:var(--lv-ink-soft)]" />
          <input
            value={farmerId}
            onChange={(e) => setFarmerId(e.target.value)}
            placeholder="예: chanho0123"
            autoComplete="username"
            autoFocus
            className="flex-1 bg-transparent text-[17px] font-bold text-[color:var(--lv-ink)] outline-none placeholder:text-[color:var(--lv-muted)]"
          />
        </div>

        {/* 비밀번호 */}
        <label className="mb-1 text-[14px] font-bold text-[color:var(--lv-ink-soft)]">비밀번호</label>
        <div className="mb-1 flex items-center gap-2 rounded-2xl border border-[var(--lv-line)] bg-white px-3.5 py-3 focus-within:border-[color:var(--lv-primary)]">
          <Lock size={20} className="shrink-0 text-[color:var(--lv-ink-soft)]" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="아무거나 입력해도 돼요 (시연용)"
            autoComplete="current-password"
            className="flex-1 bg-transparent text-[17px] font-bold text-[color:var(--lv-ink)] outline-none placeholder:text-[color:var(--lv-muted)]"
          />
        </div>
        <p className="mb-6 text-[12px] font-bold text-[color:var(--lv-muted)]">
          시연 모드라 비밀번호는 검증하지 않아요.
        </p>

        {error && (
          <p className="mb-3 rounded-xl bg-[var(--lv-warn-soft)] px-3.5 py-2.5 text-[14px] font-bold text-[color:var(--lv-warn)]">
            {error}
          </p>
        )}

        <div className="mt-auto">
          <button
            type="submit"
            disabled={!canSubmit}
            className={`flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl text-[17px] font-extrabold text-white ${
              canSubmit
                ? "bg-[var(--lv-primary)] shadow-[0_6px_16px_rgba(47,109,79,0.3)]"
                : "bg-[var(--lv-primary)] opacity-40"
            }`}
          >
            {submitting ? (
              <>
                <Loader size={20} className="animate-spin" />
                로그인 중…
              </>
            ) : (
              "로그인"
            )}
          </button>

          {/* 시연 가이드 — 알려진 시연 ID 한 줄 안내 */}
          <p className="mt-4 text-center text-[12px] font-bold text-[color:var(--lv-muted)] [word-break:keep-all]">
            시연용 아이디: <span className="text-[color:var(--lv-primary)]">chanho0123</span> · <span className="text-[color:var(--lv-primary)]">sunnypark</span> · <span className="text-[color:var(--lv-primary)]">ylkim</span>
          </p>
        </div>
      </form>
    </div>
  );
}
