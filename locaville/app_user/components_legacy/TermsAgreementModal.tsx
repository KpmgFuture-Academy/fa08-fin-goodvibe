"use client";

/**
 * 첫 진입 시 약관 동의 모달 — v4 senior-first redesign.
 *
 * 흐름:
 *   - LocavilleApp mount 시 `hasAgreedToTerms()` false 면 띄움
 *   - 필수 2개 모두 체크해야 "동의하고 시작" 활성
 *   - 선택 1개 (위치 기반) 는 체크 안 해도 통과 가능
 *
 * 디자인 원칙 (3 critic 비평 통합):
 *   1. 시니어 친화: 모든 글씨 ≥15px (제목 ≥19px), 카드 전체가 단일 hit area
 *   2. 홈화면 톤 정합: 카드 border + 녹색 글로우 shadow + 상단 chip/dot 패턴
 *   3. 도메인 임팩트: v1.0/시행일/도메인 keyword sub-line/처리위탁 disclosure
 */

import { useState, useEffect } from "react";
import { ChevronLeft, BookOpen, Info, MapPin, ShieldCheck, FileText, Check, X } from "lucide-react";
import {
  TERMS_CONTENTS,
  TERMS_KEYS,
  TERMS_OPTIONAL,
  TERMS_REQUIRED,
  TERMS_EFFECTIVE_DATE,
  TERMS_VERSION,
  type TermsKey,
} from "@/lib/terms-content";
import { recordTermsAgreement } from "@/lib/preferences";

interface TermsAgreementModalProps {
  open: boolean;
  onAgreed: () => void;
}

// 홈화면과 같은 부드러운 cream 톤 (단색, gradient X).
const BG = "#fdfbf4";

// 홈 카드와 정확히 동일한 시그니처 — '같은 family' 인식.
const CARD_BORDER = "1px solid rgba(47, 109, 79, 0.14)";
const CARD_SHADOW =
  "0 2px 6px rgba(31, 42, 31, 0.05), 0 16px 36px rgba(47, 109, 79, 0.08)";

// 약관별 도메인 sub-line — 청중이 한눈에 "저탄마을 약관" 임을 인지하도록.
const TERMS_DOMAIN_HINT: Record<TermsKey, string> = {
  이용약관: "공익직불제·저탄소 인증 영농일지를 기록해요. AI 는 도움만 드려요.",
  개인정보처리방침: "농지·일지·증빙 사진은 5년 동안 안전하게 보관해요.",
  "위치 기반 서비스 이용약관": "GPS 가 자동으로 찍혀 농지 확인에 쓰여요 (위치정보법 근거).",
};

const TERMS_ICON: Record<TermsKey, typeof FileText> = {
  이용약관: FileText,
  개인정보처리방침: ShieldCheck,
  "위치 기반 서비스 이용약관": MapPin,
};

function safeVibrate(ms: number) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(ms);
    } catch {
      /* iOS Safari 등 미지원 — 조용히 무시 */
    }
  }
}

export default function TermsAgreementModal({ open, onAgreed }: TermsAgreementModalProps) {
  const [checked, setChecked] = useState<Record<TermsKey, boolean>>({
    이용약관: false,
    개인정보처리방침: false,
    "위치 기반 서비스 이용약관": false,
  });
  const [detailKey, setDetailKey] = useState<TermsKey | null>(null);
  // sticky CTA 를 눌렀는데 필수 미체크 시 안내문을 빨갛게 잠깐 강조 ("거기 체크하세요" 시그널)
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    if (!nudge) return;
    const t = window.setTimeout(() => setNudge(false), 1800);
    return () => window.clearTimeout(t);
  }, [nudge]);

  if (!open) return null;

  const allRequiredChecked = TERMS_REQUIRED.every((k) => checked[k]);
  const everyOn = TERMS_KEYS.every((k) => checked[k]);
  const locationOn = checked["위치 기반 서비스 이용약관"];

  function toggleAll() {
    const next = !everyOn;
    setChecked({
      이용약관: next,
      개인정보처리방침: next,
      "위치 기반 서비스 이용약관": next,
    });
    safeVibrate(15);
  }

  function toggleOne(key: TermsKey) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
    safeVibrate(12);
  }

  function handleAgree() {
    if (!allRequiredChecked) {
      setNudge(true);
      safeVibrate(30);
      return;
    }
    recordTermsAgreement(locationOn);
    onAgreed();
  }

  function handleAgreeFromDetail(key: TermsKey) {
    setChecked((prev) => ({ ...prev, [key]: true }));
    setDetailKey(null);
    safeVibrate(15);
  }

  // 약관 본문을 "제N조 (제목)" 헤딩으로 시각 분리해 시니어 가독성 향상.
  function renderTermsBody(text: string) {
    const lines = text.split("\n");
    const blocks: Array<{ kind: "heading" | "para"; text: string }> = [];
    let buf: string[] = [];
    const flush = () => {
      if (buf.length > 0) {
        blocks.push({ kind: "para", text: buf.join("\n") });
        buf = [];
      }
    };
    // 제N조 또는 1./2. 등으로 시작하는 줄을 heading 으로 — 의미 있는 단락 분리.
    const headingRe = /^(제\d+조|\d+\.\s|\[필수\]|\[선택\])/;
    for (const line of lines) {
      if (headingRe.test(line.trim())) {
        flush();
        blocks.push({ kind: "heading", text: line });
      } else {
        buf.push(line);
      }
    }
    flush();
    return blocks;
  }

  // ── Detail view — 특정 약관 전문 ──
  if (detailKey) {
    const blocks = renderTermsBody(TERMS_CONTENTS[detailKey]);
    const Icon = TERMS_ICON[detailKey];
    return (
      <div
        className="fixed inset-0 flex flex-col"
        style={{ background: BG, color: "var(--ink)", zIndex: 100 }}
      >
        {/* 상단 — 뒤로가기 + 제목 (홈 톤과 통일된 typography) */}
        <div
          className="flex shrink-0 items-center gap-3 px-4 pb-4"
          style={{ paddingTop: "max(20px, env(safe-area-inset-top))" }}
        >
          <button
            onClick={() => setDetailKey(null)}
            className="flex items-center justify-center rounded-full active:opacity-80"
            aria-label="돌아가기"
            style={{
              width: 48,
              height: 48,
              background: "#ffffff",
              border: "1.5px solid var(--accent)",
              boxShadow: "0 2px 6px rgba(31, 42, 31, 0.08)",
            }}
          >
            <ChevronLeft className="h-6 w-6" style={{ color: "var(--accent-dark)" }} strokeWidth={2.5} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Icon className="w-5 h-5" style={{ color: "var(--accent-dark)" }} />
              <h2
                style={{
                  color: "var(--ink)",
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.3,
                }}
              >
                {detailKey}
              </h2>
            </div>
            <p
              className="mt-1"
              style={{
                color: "var(--ink-soft)",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.01em",
              }}
            >
              v{TERMS_VERSION} · 시행 {TERMS_EFFECTIVE_DATE}
            </p>
          </div>
        </div>

        {/* 본문 — 제N조 자동 heading 처리 */}
        <div className="flex-1 overflow-y-auto px-4 pb-5">
          <div
            className="rounded-3xl px-5 py-5"
            style={{
              background: "#ffffff",
              border: CARD_BORDER,
              boxShadow: CARD_SHADOW,
            }}
          >
            {blocks.map((b, i) =>
              b.kind === "heading" ? (
                <h3
                  key={i}
                  style={{
                    color: "var(--accent-dark)",
                    fontSize: 18,
                    fontWeight: 800,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.4,
                    marginTop: i === 0 ? 0 : 20,
                    marginBottom: 8,
                  }}
                >
                  {b.text}
                </h3>
              ) : (
                <p
                  key={i}
                  className="whitespace-pre-wrap break-keep"
                  style={{
                    color: "var(--ink)",
                    fontSize: 17,
                    fontWeight: 500,
                    lineHeight: 1.7,
                    marginBottom: 4,
                  }}
                >
                  {b.text}
                </p>
              ),
            )}
          </div>
        </div>

        {/* footer — 2-button row: 닫기(ghost) + 읽고 동의(primary) */}
        <div
          className="shrink-0 px-4 py-4 flex gap-3"
          style={{
            background: BG,
            borderTop: "1px solid var(--line-soft, rgba(31,42,31,0.08))",
            paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          }}
        >
          <button
            onClick={() => setDetailKey(null)}
            className="rounded-2xl active:opacity-85"
            style={{
              flex: "0 0 32%",
              minHeight: 60,
              background: "#ffffff",
              color: "var(--accent-dark)",
              border: "1.5px solid var(--accent)",
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: "-0.01em",
            }}
          >
            닫기
          </button>
          <button
            onClick={() => handleAgreeFromDetail(detailKey)}
            className="flex-1 rounded-2xl active:opacity-90 active:translate-y-px transition-transform"
            style={{
              minHeight: 60,
              background: "var(--accent)",
              color: "#ffffff",
              border: "none",
              fontSize: 19,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              boxShadow: "0 6px 16px rgba(47, 109, 79, 0.22)",
            }}
          >
다 읽었어요, 동의합니다
          </button>
        </div>
      </div>
    );
  }

  // ── List view — 동의 체크 ──
  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: BG, color: "var(--ink)", zIndex: 100 }}
    >
      <div
        className="flex-1 overflow-y-auto px-4 pb-5"
        style={{ paddingTop: "max(28px, calc(env(safe-area-inset-top) + 16px))" }}
      >
        {/* 헤더 — 큰 제목 + 도메인 anchor + 효력 chip */}
        <div className="px-1 mb-5">
          <h1
            style={{
              color: "var(--ink)",
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "-0.025em",
              lineHeight: 1.3,
            }}
          >
            저탄마을 약관 동의
          </h1>
          {/* 효력 chip — always visible, 진짜 약관임을 한눈에 */}
          <div className="mt-3 flex items-center flex-wrap gap-2">
            <span
              className="inline-flex items-center gap-1.5"
              style={{
                background: "var(--accent-soft, #e3f0e6)",
                color: "var(--accent-dark)",
                fontSize: 13,
                fontWeight: 800,
                padding: "5px 12px",
                borderRadius: 999,
                letterSpacing: "0.01em",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--accent-dark)",
                }}
              />
              v{TERMS_VERSION} · 시행 {TERMS_EFFECTIVE_DATE}
            </span>
            <span
              style={{
                color: "var(--ink-soft)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              발행: 저탄마을 운영팀
            </span>
          </div>
          <p
            className="mt-3"
            style={{
              color: "var(--ink-soft)",
              fontSize: 17,
              fontWeight: 600,
              lineHeight: 1.6,
            }}
          >
            앱을 쓰시려면 아래 약관에 먼저 동의해 주세요.
            <br />
            <span style={{ color: "var(--ink-soft)", fontWeight: 500, fontSize: 15 }}>
              항목마다 &lsquo;자세히 보기&rsquo; 를 누르면 전체 내용을 볼 수 있어요.
            </span>
          </p>
        </div>

        {/* 전체 약관 동의 — 메타 카드. unchecked 도 green-tinted, checked 시 accent fill. */}
        <button
          type="button"
          onClick={toggleAll}
          className="w-full flex items-center gap-4 px-5 py-5 mb-2 rounded-3xl active:opacity-95 transition-all"
          style={{
            background: everyOn ? "var(--accent)" : "var(--accent-soft, #e3f0e6)",
            border: everyOn
              ? "1.5px solid var(--accent-dark)"
              : "1.5px solid rgba(47, 109, 79, 0.22)",
            boxShadow: everyOn
              ? "0 6px 16px rgba(47, 109, 79, 0.22)"
              : "0 2px 6px rgba(31, 42, 31, 0.05), 0 16px 36px rgba(47, 109, 79, 0.08)",
            color: everyOn ? "#ffffff" : "var(--ink)",
            transition: "background 250ms ease, box-shadow 250ms ease, border-color 250ms ease",
          }}
        >
          <Checkbox checked={everyOn} large invert={everyOn} />
          <div className="flex-1 text-left">
            <span
              className="block"
              style={{
                color: everyOn ? "#ffffff" : "var(--accent-dark)",
                fontSize: 21,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                lineHeight: 1.3,
              }}
            >
              전체 동의하고 시작
            </span>
            <span
              className="block mt-1.5"
              style={{
                color: everyOn ? "rgba(255,255,255,0.92)" : "var(--ink-soft)",
                fontSize: 15,
                fontWeight: 600,
                lineHeight: 1.5,
              }}
            >
              필수 2개 · 선택 1개 한꺼번에 동의하고 영농일지를 시작해요
            </span>
          </div>
        </button>

        {/* 메타 카드 → 개별 카드 사이 sub-label */}
        <p
          className="px-2 mb-3"
          style={{
            color: "var(--muted-2, #8a8e7e)",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.01em",
            marginTop: 14,
          }}
        >
          하나씩 동의도 가능해요
        </p>

        {/* 개별 약관 카드 그룹 */}
        <div className="flex flex-col gap-3">
          {TERMS_KEYS.map((key) => {
            const isRequired = TERMS_REQUIRED.includes(key);
            const isChecked = checked[key];
            const Icon = TERMS_ICON[key];
            const isLocation = key === "위치 기반 서비스 이용약관";
            return (
              <div
                key={key}
                className="rounded-3xl overflow-hidden"
                style={{
                  background: isChecked ? "var(--accent-soft, #e3f0e6)" : "#ffffff",
                  border: isChecked
                    ? "1.5px solid var(--accent)"
                    : CARD_BORDER,
                  boxShadow: CARD_SHADOW,
                  transition:
                    "background 250ms ease, border-color 250ms ease, box-shadow 250ms ease",
                }}
              >
                {/* 카드 전체 = 단일 토글 button (체크박스+라벨 hit area 통합) */}
                <button
                  type="button"
                  onClick={() => toggleOne(key)}
                  className="w-full px-5 py-5 flex flex-col gap-3 text-left active:opacity-95"
                  style={{ background: "transparent", border: "none" }}
                  aria-pressed={isChecked}
                  aria-label={`${key} 동의 ${isChecked ? "해제" : "선택"}`}
                >
                  {/* 상단 chip — 홈 카드와 동일한 dot+pill 패턴 */}
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span
                      className="inline-flex items-center gap-1.5"
                      style={{
                        background: isRequired
                          ? "rgba(192, 57, 43, 0.10)"
                          : "rgba(94, 99, 86, 0.10)",
                        color: isRequired ? "var(--danger, #c0392b)" : "var(--ink-soft)",
                        fontSize: 14,
                        fontWeight: 800,
                        padding: "5px 12px",
                        borderRadius: 999,
                        letterSpacing: "0.01em",
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: isRequired
                            ? "var(--danger, #c0392b)"
                            : "var(--ink-soft)",
                        }}
                      />
                      {isRequired ? "꼭 동의해 주세요" : "동의 안 하셔도 돼요"}
                    </span>
                  </div>

                  {/* 본문 — 아이콘 + 약관명 + 도메인 sub-line + 체크박스 */}
                  <div className="flex items-start gap-3">
                    <div
                      className="flex-shrink-0 flex items-center justify-center"
                      style={{
                        background: isChecked
                          ? "rgba(47, 109, 79, 0.16)"
                          : "rgba(47, 109, 79, 0.08)",
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                      }}
                    >
                      <Icon
                        className="w-6 h-6"
                        style={{ color: "var(--accent-dark)" }}
                        strokeWidth={2.2}
                      />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <span
                        className="block break-keep"
                        style={{
                          color: "var(--ink)",
                          fontSize: 19,
                          fontWeight: 800,
                          letterSpacing: "-0.02em",
                          lineHeight: 1.3,
                        }}
                      >
                        {key}
                      </span>
                      <span
                        className="block break-keep"
                        style={{
                          color: "var(--ink-soft)",
                          fontSize: 14,
                          fontWeight: 600,
                          lineHeight: 1.5,
                        }}
                      >
                        {TERMS_DOMAIN_HINT[key]}
                      </span>
                    </div>
                    <div className="flex-shrink-0 self-center">
                      <Checkbox checked={isChecked} />
                    </div>
                  </div>

                  {/* 위치 약관 내부 — 동의/거부 trade-off mini box (always visible) */}
                  {isLocation && (
                    <div
                      className="rounded-2xl px-4 py-3.5 mt-1"
                      style={{
                        background: isChecked
                          ? "rgba(255,255,255,0.55)"
                          : "rgba(47, 109, 79, 0.06)",
                        border: "1px solid rgba(47, 109, 79, 0.14)",
                      }}
                    >
                      <div className="flex items-start gap-2.5 mb-2">
                        <Check
                          className="w-5 h-5 flex-shrink-0 mt-0.5"
                          style={{ color: "var(--accent-dark)" }}
                          strokeWidth={3}
                        />
                        <p
                          className="break-keep"
                          style={{
                            color: "var(--accent-dark)",
                            fontSize: 14,
                            fontWeight: 700,
                            lineHeight: 1.5,
                          }}
                        >
                          동의하시면: 사진에 위치와 시간이 자동으로 들어가 직불금 심사가 빨라져요
                        </p>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <X
                          className="w-5 h-5 flex-shrink-0 mt-0.5"
                          style={{ color: "var(--ink-soft)" }}
                          strokeWidth={3}
                        />
                        <p
                          className="break-keep"
                          style={{
                            color: "var(--ink-soft)",
                            fontSize: 14,
                            fontWeight: 600,
                            lineHeight: 1.5,
                          }}
                        >
                          안 하시면: 사진을 올릴 때마다 농지를 직접 골라 주셔야 해요
                        </p>
                      </div>
                    </div>
                  )}
                </button>

                {/* 카드 하단 — '자세히 보기' 전용 row (full-width, 충분한 hit area) */}
                <div
                  style={{
                    borderTop: "1px solid rgba(47, 109, 79, 0.12)",
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailKey(key);
                    }}
                    className="w-full flex items-center justify-center gap-2 active:opacity-70"
                    style={{
                      minHeight: 52,
                      padding: "12px 20px",
                      background: "transparent",
                      color: "var(--accent-dark)",
                      fontSize: 16,
                      fontWeight: 800,
                      letterSpacing: "-0.01em",
                      border: "none",
                    }}
                  >
                    <BookOpen className="w-5 h-5" strokeWidth={2.2} />
                    약관 전체 내용 보기
                    <span style={{ marginLeft: 2 }}>›</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 도메인 disclosure block — 모달 자체에서 "진짜 약관" 신호 */}
        <div
          className="mt-6 px-4 py-4 rounded-2xl"
          style={{
            background: "rgba(94, 99, 86, 0.06)",
            border: "1px solid rgba(94, 99, 86, 0.10)",
          }}
        >
          <div className="flex items-start gap-2.5">
            <Info
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              style={{ color: "var(--ink-soft)" }}
              strokeWidth={2.2}
            />
            <div className="flex-1 flex flex-col gap-1.5">
              <p
                style={{
                  color: "var(--ink)",
                  fontSize: 14,
                  fontWeight: 800,
                  letterSpacing: "-0.01em",
                }}
              >
                개인정보보호법과 위치정보법에 따라 받는 동의예요
              </p>
              <p
                className="break-keep"
                style={{
                  color: "var(--ink-soft)",
                  fontSize: 13,
                  fontWeight: 600,
                  lineHeight: 1.6,
                }}
              >
                AI 분석은 OpenAI 가, 자료 저장은 Supabase·Render 가 맡아요.
                <br />
                직불금 심사에 필요한 자료는 농림축산식품부에 법령에 따라 전해드려요.
                <br />
                영농일지와 증빙 사진은 5년 동안 보관해요 · 분쟁 관할: 서울중앙지방법원
              </p>
            </div>
          </div>
        </div>

        {/* 변경 가능 안내 — 실수 복원성 */}
        <p
          className="mt-3 px-2 flex items-center gap-1.5"
          style={{
            color: "var(--ink-soft)",
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.5,
          }}
        >
          <Info className="w-4 h-4 flex-shrink-0" strokeWidth={2.2} />
          동의하신 뒤에도 설정에서 언제든 바꾸실 수 있어요
        </p>
      </div>

      {/* sticky footer — 비활성 CTA 도 green-soft 톤으로 항상 식별 가능 */}
      <div
        className="shrink-0 px-4 pt-3 pb-4"
        style={{
          background: BG,
          borderTop: "1px solid var(--line-soft, rgba(31,42,31,0.08))",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        }}
      >
        {/* nudge 안내문 — 필수 미체크 시 항상 보이되, 시도 시 빨갛게 강조 */}
        {!allRequiredChecked && (
          <p
            className="mb-3 px-1 flex items-center gap-1.5 break-keep"
            style={{
              color: nudge ? "var(--danger, #c0392b)" : "var(--ink-soft)",
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1.5,
              transition: "color 200ms ease",
            }}
          >
            <span style={{ fontSize: 16 }}>↑</span>
            꼭 필요한 약관에 모두 동의하셔야 영농일지를 시작하실 수 있어요
          </p>
        )}
        <button
          onClick={handleAgree}
          aria-disabled={!allRequiredChecked}
          className="w-full rounded-2xl transition-all active:opacity-90 active:translate-y-px"
          style={{
            minHeight: 68,
            padding: "20px",
            background: allRequiredChecked
              ? "var(--accent)"
              : "rgba(47, 109, 79, 0.10)",
            color: allRequiredChecked ? "#ffffff" : "var(--accent-dark)",
            border: "none",
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: "-0.01em",
            boxShadow: allRequiredChecked
              ? "0 6px 16px rgba(47, 109, 79, 0.22)"
              : "none",
          }}
        >
          동의하고 시작하기
          {allRequiredChecked && (
            <span
              className="block mt-0.5"
              style={{
                color: "rgba(255,255,255,0.88)",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.01em",
              }}
            >
              영농일지를 바로 시작합니다
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function Checkbox({
  checked,
  large = false,
  invert = false,
}: {
  checked: boolean;
  large?: boolean;
  invert?: boolean;
}) {
  const size = large ? 36 : 30;
  // invert = 부모 배경이 진녹색 fill 인 경우 (전체동의 checked) — 체크박스를 흰 fill 로.
  const fillBg = invert ? "#ffffff" : checked ? "var(--accent)" : "#ffffff";
  const borderColor = invert
    ? "#ffffff"
    : checked
      ? "var(--accent)"
      : "var(--ink-soft)";
  const checkColor = invert ? "var(--accent-dark)" : "#ffffff";
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: fillBg,
        border: `2.5px solid ${borderColor}`,
        borderRadius: 10,
        transition: "background 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
        boxShadow: checked && !invert ? "0 2px 6px rgba(47, 109, 79, 0.30)" : "none",
      }}
    >
      <svg
        width={size - 12}
        height={size - 12}
        viewBox="0 0 24 24"
        fill="none"
        stroke={checkColor}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          transform: checked ? "scale(1)" : "scale(0.5)",
          opacity: checked ? 1 : 0,
          transition: "transform 180ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms ease",
        }}
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}
