"use client";

/**
 * 기록 완료 팝업 — 홈화면 룩앤필 (chip 헤더 + 흰 카드 + accent-soft accent).
 *
 * 구조:
 *   1) 헤더 — primary 글로우 + 흰 체크. 큰 제목 + ink-soft 부제 "이장님이 확인하실 거예요"
 *   2) AI 분석 카드 (highlightLines) — accent-soft 카드 + "✦ AI 가 본 사진" chip + 큰 ink 텍스트
 *   3) 부가 정보 카드 들 (detailLines) — 흰 카드, 아이콘 + label + 큰 value (홈의 row 톤)
 *   4) CTA — 큰 primary "홈으로 가기"
 */

import { CheckCircle2, Sparkles, MapPin, ShieldCheck, Info } from "lucide-react";

interface CompletionModalProps {
  open: boolean;
  title: string;
  highlightLines?: string[];
  detailLines?: { label: string; value: string }[];
  onHome: () => void;
  onList?: () => void;
  homeLabel?: string;
}

/** label 텍스트 → 작은 아이콘 매핑. 알 수 없으면 Info. */
function iconForLabel(label: string): React.ReactNode {
  const k = label.trim();
  if (k.includes("위치") || k.includes("주소")) return <MapPin className="w-4 h-4" strokeWidth={2.4} />;
  if (k.includes("AI") || k.includes("분류")) return <Sparkles className="w-4 h-4" strokeWidth={2.4} />;
  if (k.includes("확인") || k.includes("검수")) return <ShieldCheck className="w-4 h-4" strokeWidth={2.4} />;
  return <Info className="w-4 h-4" strokeWidth={2.4} />;
}

export default function CompletionModal({
  open,
  title,
  highlightLines = [],
  detailLines = [],
  onHome,
  onList,
  homeLabel = "홈으로 가기",
}: CompletionModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{
        background: "rgba(15, 23, 16, 0.72)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        className="w-full rounded-[28px]"
        style={{
          maxWidth: 420,
          background: "#ffffff",
          padding: "32px 28px 28px",
          boxShadow:
            "0 24px 60px rgba(15, 23, 16, 0.32), 0 8px 18px rgba(15, 23, 16, 0.18)",
        }}
      >
        {/* 1) 헤더 — primary 글로우 + 체크 + 큰 제목 + 부제. 넉넉한 위/아래 여백. */}
        <div className="flex flex-col items-center text-center">
          <div
            className="flex items-center justify-center"
            style={{
              width: 100,
              height: 100,
              marginBottom: 20,
              background:
                "radial-gradient(circle, rgba(47, 109, 79, 0.18) 0%, rgba(47, 109, 79, 0.04) 70%)",
              borderRadius: "50%",
            }}
          >
            <div
              className="rounded-full flex items-center justify-center"
              style={{
                width: 68,
                height: 68,
                background: "var(--primary)",
                boxShadow: "0 8px 18px rgba(47, 109, 79, 0.35)",
              }}
            >
              <CheckCircle2 className="h-10 w-10" style={{ color: "#ffffff" }} strokeWidth={2.5} />
            </div>
          </div>
          <h2
            style={{
              color: "var(--ink)",
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.3,
            }}
          >
            {title}
          </h2>
          <p
            style={{
              marginTop: 12,
              color: "var(--ink-soft)",
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              lineHeight: 1.5,
            }}
          >
            이장님이 한 번 더 확인하실 거예요
          </p>
        </div>

        {/* 2) AI 분석 카드 — 넉넉한 padding + 큰 줄 간격. */}
        {highlightLines.length > 0 && (
          <div
            style={{
              marginTop: 32,
              background: "var(--accent-soft)",
              borderRadius: 20,
              padding: "20px 22px",
            }}
          >
            <span
              className="inline-flex items-center"
              style={{
                background: "rgba(47, 109, 79, 0.16)",
                color: "var(--primary)",
                fontSize: 13,
                fontWeight: 800,
                padding: "6px 12px",
                borderRadius: 999,
                letterSpacing: "-0.01em",
                gap: 6,
                marginBottom: 14,
              }}
            >
              <Sparkles className="w-4 h-4" strokeWidth={2.6} />
              AI 가 본 사진
            </span>
            <div className="flex flex-col" style={{ gap: 6 }}>
              {highlightLines.map((line, index) => (
                <p
                  key={index}
                  className="break-keep"
                  style={{
                    color: "var(--ink)",
                    fontSize: 18,
                    fontWeight: 800,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.5,
                  }}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* 3) 부가 정보 — 한 카드 안에 row 묶음. 행 간 넓은 padding. */}
        {detailLines.length > 0 && (
          <div
            style={{
              marginTop: 16,
              background: "#ffffff",
              border: "1px solid var(--line-soft)",
              borderRadius: 20,
              overflow: "hidden",
            }}
          >
            {detailLines.map((row, index) => (
              <div
                key={index}
                className="flex items-center"
                style={{
                  padding: "18px 22px",
                  gap: 14,
                  borderBottom:
                    index === detailLines.length - 1 ? "none" : "1px solid var(--line-soft)",
                }}
              >
                <div
                  className="flex-shrink-0 rounded-full flex items-center justify-center"
                  style={{
                    width: 36,
                    height: 36,
                    background: "var(--accent-soft)",
                    color: "var(--primary)",
                  }}
                >
                  {iconForLabel(row.label)}
                </div>
                <p
                  className="break-keep flex-1 min-w-0"
                  style={{
                    color: "var(--ink)",
                    fontSize: 16,
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.5,
                  }}
                >
                  {row.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* 4) CTA — 큰 primary 버튼. 위 여백 충분, 버튼 높이 큼. */}
        <div
          className={`grid ${onList ? "grid-cols-2" : "grid-cols-1"}`}
          style={{ marginTop: 32, gap: 12 }}
        >
          <button
            onClick={onHome}
            className="rounded-2xl active:translate-y-0.5 transition-transform"
            style={{
              background: "var(--primary)",
              color: "#ffffff",
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              padding: "18px 16px",
              boxShadow:
                "0 8px 20px rgba(47, 109, 79, 0.32), 0 3px 6px rgba(47, 109, 79, 0.20)",
            }}
          >
            {homeLabel}
          </button>
          {onList && (
            <button
              onClick={onList}
              className="rounded-2xl active:opacity-90"
              style={{
                background: "#ffffff",
                border: "1px solid var(--line)",
                color: "var(--ink)",
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: "-0.01em",
                padding: "18px 16px",
              }}
            >
              목록 보기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
