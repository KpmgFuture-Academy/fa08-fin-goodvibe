"use client";

/**
 * todo 로딩 placeholder — backend 응답이 도착하기 전 짧은 시간(보통 0.3~1초)
 * 동안 보여줘서 "데이터가 곧 옵니다" 느낌. 빈 화면이나 깜빡임 방지.
 *
 * 두 가지 사이즈:
 *   - "alert" : HomeScreen 상단 알림 카드용 (큰 박스, 아이콘 + 작업명 + 날짜)
 *   - "row"   : JournalScreen 안 list row 용 (작은 박스, 아이콘 + 두 줄)
 *
 * 색은 v0_chief 토큰과 동기. Tailwind animate-pulse 로 부드러운 깜빡임.
 */

type SkeletonProps = {
  count?: number;
};

export function TodoAlertSkeleton({ count = 1 }: SkeletonProps) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="w-full px-4 py-4 flex items-start gap-3 rounded-2xl animate-pulse"
          style={{
            background: "#ffffff",
            borderLeft: "4px solid var(--warn)",
            boxShadow: "0 2px 12px rgba(31, 42, 31, 0.06), 0 1px 3px rgba(31, 42, 31, 0.04)",
          }}
          aria-hidden
        >
          {/* 아이콘 자리 */}
          <div
            className="w-9 h-9 rounded-full flex-shrink-0 mt-0.5"
            style={{ background: "var(--warn-soft)" }}
          />
          {/* 본문 3줄 placeholder */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="h-5 rounded w-3/5" style={{ background: "var(--line-soft)" }} />
            <div className="h-4 rounded w-4/5" style={{ background: "var(--line-soft)", opacity: 0.7 }} />
            <div className="h-4 rounded w-1/2 mt-1" style={{ background: "var(--line-soft)", opacity: 0.7 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TodoRowSkeleton({ count = 2 }: SkeletonProps) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 p-3 rounded-xl bg-card animate-pulse"
          aria-hidden
        >
          <div
            className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5"
            style={{ background: "var(--line-soft)" }}
          />
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <div className="h-4 rounded w-2/3" style={{ background: "var(--line-soft)" }} />
            <div className="h-3 rounded w-4/5" style={{ background: "var(--line-soft)", opacity: 0.7 }} />
          </div>
          <div
            className="h-5 w-12 rounded-lg flex-shrink-0"
            style={{ background: "var(--line-soft)", opacity: 0.7 }}
          />
        </div>
      ))}
    </div>
  );
}
