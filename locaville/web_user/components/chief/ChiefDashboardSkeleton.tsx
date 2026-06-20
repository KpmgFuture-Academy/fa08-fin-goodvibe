"use client";

/**
 * ChiefDashboardSkeleton — 대시보드 로딩 중 "박스 자리표시"(스켈레톤).
 *
 * ChiefDashboard 와 동일한 레이아웃/클래스(lvb-home-stream / lvb-row / lvb-pulse …)를
 * 그대로 써서 자리·간격을 흉내낸다. 전체를 animate-pulse 로 은은히 깜빡인다.
 * 쉬운 보기: 한 컬럼(+상단 메모 strip), 표준 보기: 본문 + 우측 사이드 — 실제 화면과 동일 분기.
 */
import { type ReactNode } from "react";
import { useChiefSettings } from "@/components/SettingsContext";

const G = "var(--lvb-line)"; // 스켈레톤 회색 (흰 카드 위에서 잘 보이는 톤)

function Bar({ w, h = 14, r = 7, mt = 0 }: { w: number | string; h?: number; r?: number; mt?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "block",
        width: typeof w === "number" ? `${w}px` : w,
        height: h,
        borderRadius: r,
        background: G,
        marginTop: mt,
      }}
    />
  );
}

function CardSkeleton({ children }: { children: ReactNode }) {
  return <div className="lvb-pulse">{children}</div>;
}

function RowSkeleton() {
  return (
    <li className="lvb-row" aria-hidden>
      <span className="lvb-row-kind" style={{ background: G }} />
      <div className="lvb-row-main">
        <div className="lvb-row-nameline" style={{ display: "flex", gap: 8 }}>
          <Bar w={88} h={16} />
          <Bar w={52} h={16} />
        </div>
        <Bar w="68%" h={16} mt={9} />
        <Bar w="42%" h={12} mt={7} />
      </div>
      <div className="lvb-row-actions" style={{ display: "flex", gap: 8 }}>
        <Bar w={92} h={40} r={12} />
        <Bar w={80} h={40} r={12} />
      </div>
    </li>
  );
}

export default function ChiefDashboardSkeleton() {
  const settings = useChiefSettings();
  const isEasy = settings.viewMode === "easy";

  return (
    <div
      className={`lvb-home lvb-home-stream${isEasy ? " lvb-home-stream--easy" : ""} animate-pulse`}
      aria-busy="true"
      aria-label="마을 정보를 불러오는 중이에요"
    >
      <div className="lvb-stream-main">
        {/* 쉬운 보기: 상단 가로 메모 strip 자리 */}
        {isEasy && (
          <div style={{ background: "var(--lvb-accent-soft)", borderRadius: 14, padding: "15px 17px", marginBottom: 16 }}>
            <Bar w="90%" h={14} />
            <Bar w="72%" h={14} mt={9} />
          </div>
        )}

        {/* 인사 문구 (오늘 처리할 일 N건) */}
        <div className="lvb-home-greet">
          <Bar w="52%" h={28} r={9} />
          <Bar w="78%" h={16} mt={11} />
        </div>

        {/* 거르기 칩 */}
        <div className="lvb-chips">
          {[72, 96, 84].map((w, i) => (
            <Bar key={i} w={w} h={40} r={999} />
          ))}
        </div>

        {/* 처리함 행들 */}
        <ul className="lvb-list">
          {[0, 1, 2, 3].map((i) => (
            <RowSkeleton key={i} />
          ))}
        </ul>
      </div>

      {/* 표준 보기에만 우측 사이드(메모 + 마을 진행률) */}
      {!isEasy && (
        <aside className="lvb-stream-side">
          <CardSkeleton>
            <Bar w="58%" h={18} />
            <Bar w="100%" h={46} r={12} mt={12} />
          </CardSkeleton>
          <CardSkeleton>
            <Bar w={140} h={18} />
            <Bar w={100} h={12} mt={8} />
            <Bar w="100%" h={10} r={6} mt={16} />
            <Bar w="100%" h={10} r={6} mt={10} />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {[0, 1, 2].map((i) => (
                <Bar key={i} w="33%" h={56} r={12} />
              ))}
            </div>
          </CardSkeleton>
        </aside>
      )}
    </div>
  );
}
