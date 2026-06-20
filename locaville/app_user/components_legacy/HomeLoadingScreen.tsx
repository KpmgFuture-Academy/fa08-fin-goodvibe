"use client";

/** 홈 첫 진입 로딩 트랜지션 — 앱 켠 직후 한 번만 노출 (세션당 1회).
 *
 *  비주얼: 흙 위로 새싹이 자라는 작은 애니메이션 + 위에 햇살 + 양옆 벼.
 *  메시지: "오늘 농사 챙기고 있어요" + 점 3개.
 *  2.2초 후 fade-out → 홈 화면.
 */

export function HomeLoadingScreen() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "linear-gradient(180deg, #fff1c2 0%, #faf6ea 55%, #d6e8c5 100%)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "0 32px",
        textAlign: "center",
        animation: "lv-home-loading-fade 2.2s ease-out forwards",
      }}
    >
      {/* 메인 일러스트 — 흙 위로 자라는 새싹 + 햇살 + 양옆 벼 */}
      <svg
        width="240"
        height="220"
        viewBox="0 0 240 220"
        aria-hidden
      >
        {/* 햇살 — 좌측 상단에서 부드럽게 회전 */}
        <g className="lv-sun">
          <circle cx="64" cy="58" r="24" fill="#ffd24d" />
          <circle cx="64" cy="58" r="32" fill="#ffd24d" opacity="0.25" />
          <g stroke="#ffd24d" strokeWidth="3" strokeLinecap="round">
            <line x1="64" y1="14" x2="64" y2="26" />
            <line x1="64" y1="90" x2="64" y2="102" />
            <line x1="20" y1="58" x2="32" y2="58" />
            <line x1="96" y1="58" x2="108" y2="58" />
            <line x1="32" y1="26" x2="40" y2="34" />
            <line x1="88" y1="82" x2="96" y2="90" />
            <line x1="96" y1="26" x2="88" y2="34" />
            <line x1="40" y1="82" x2="32" y2="90" />
          </g>
        </g>

        {/* 작은 구름 두 개 */}
        <g opacity="0.7">
          <ellipse cx="172" cy="48" rx="22" ry="8" fill="#ffffff" />
          <ellipse cx="186" cy="42" rx="16" ry="6" fill="#ffffff" />
          <ellipse cx="200" cy="78" rx="18" ry="6" fill="#ffffff" />
        </g>

        {/* 양옆 벼 — 작게 흔들림 */}
        <g className="lv-rice-left">
          <path d="M40,200 Q42,160 44,150" stroke="#5d9050" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <ellipse cx="40" cy="148" rx="3.5" ry="6" fill="#a3c87f" />
          <ellipse cx="44" cy="142" rx="3" ry="5" fill="#a3c87f" />
          <ellipse cx="48" cy="148" rx="3.5" ry="6" fill="#a3c87f" />
          <path d="M28,200 Q30,170 32,162" stroke="#5d9050" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <ellipse cx="28" cy="160" rx="3" ry="5" fill="#a3c87f" />
          <ellipse cx="34" cy="156" rx="3" ry="5" fill="#a3c87f" />
        </g>
        <g className="lv-rice-right">
          <path d="M200,200 Q198,160 196,150" stroke="#5d9050" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <ellipse cx="200" cy="148" rx="3.5" ry="6" fill="#a3c87f" />
          <ellipse cx="196" cy="142" rx="3" ry="5" fill="#a3c87f" />
          <ellipse cx="192" cy="148" rx="3.5" ry="6" fill="#a3c87f" />
          <path d="M212,200 Q210,170 208,162" stroke="#5d9050" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <ellipse cx="212" cy="160" rx="3" ry="5" fill="#a3c87f" />
          <ellipse cx="206" cy="156" rx="3" ry="5" fill="#a3c87f" />
        </g>

        {/* 가운데 흙 더미 (큰) */}
        <ellipse cx="120" cy="200" rx="60" ry="14" fill="#7a5634" opacity="0.92" />
        <path
          d="M60,200 Q80,176 100,180 Q120,166 140,180 Q160,176 180,200 Z"
          fill="#8b6b3f"
        />
        {/* 흙 결 */}
        <g stroke="#5a3e1f" strokeWidth="1.2" opacity="0.5" strokeLinecap="round">
          <line x1="74" y1="194" x2="80" y2="192" />
          <line x1="92" y1="190" x2="100" y2="188" />
          <line x1="120" y1="188" x2="130" y2="186" />
          <line x1="148" y1="192" x2="156" y2="190" />
        </g>

        {/* 새싹 — 줄기 자라는 + 잎 두 개 펴짐 */}
        <g style={{ transformOrigin: "120px 184px" }}>
          {/* 줄기 (자라남) */}
          <path
            className="lv-stem"
            d="M120,184 L120,130"
            stroke="#3d7a5a"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {/* 왼쪽 잎 */}
          <path
            className="lv-leaf-left"
            d="M120,150 C100,148 92,134 96,124 C104,128 118,138 120,150 Z"
            fill="#5da97a"
          />
          {/* 오른쪽 잎 */}
          <path
            className="lv-leaf-right"
            d="M120,142 C140,138 148,124 144,114 C136,118 122,128 120,142 Z"
            fill="#6fb88c"
          />
          {/* 줄기 끝 새싹 동그라미 */}
          <circle className="lv-tip" cx="120" cy="130" r="3" fill="#3d7a5a" />
        </g>
      </svg>

      <h1
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: "#1f2a1f",
          margin: 0,
          letterSpacing: "-0.025em",
          lineHeight: 1.3,
        }}
      >
        오늘 할 일 챙기는 중이에요
      </h1>
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#5e6356",
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        잠시만 기다려 주세요
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <span className="lv-home-dot lv-home-dot-1" />
        <span className="lv-home-dot lv-home-dot-2" />
        <span className="lv-home-dot lv-home-dot-3" />
      </div>

      <style>{`
        @keyframes lv-home-loading-fade {
          0%   { opacity: 1; }
          85%  { opacity: 1; }
          100% { opacity: 0; visibility: hidden; }
        }

        /* 햇살 천천히 회전 */
        @keyframes lv-sun-rotate {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .lv-sun {
          transform-origin: 64px 58px;
          transform-box: fill-box;
          animation: lv-sun-rotate 8s linear infinite;
        }

        /* 양옆 벼 좌우 흔들림 */
        @keyframes lv-rice-sway-l {
          0%, 100% { transform: rotate(-2deg); }
          50%      { transform: rotate(3deg); }
        }
        @keyframes lv-rice-sway-r {
          0%, 100% { transform: rotate(2deg); }
          50%      { transform: rotate(-3deg); }
        }
        .lv-rice-left {
          transform-origin: 38px 200px;
          transform-box: fill-box;
          animation: lv-rice-sway-l 2.4s ease-in-out infinite;
        }
        .lv-rice-right {
          transform-origin: 202px 200px;
          transform-box: fill-box;
          animation: lv-rice-sway-r 2.4s ease-in-out infinite;
        }

        /* 새싹 줄기 — 흙에서 자라 올라옴 */
        @keyframes lv-stem-grow {
          0%   { stroke-dasharray: 0 60; }
          60%  { stroke-dasharray: 60 0; }
          100% { stroke-dasharray: 60 0; }
        }
        .lv-stem {
          stroke-dasharray: 0 60;
          animation: lv-stem-grow 1.6s ease-out forwards;
        }

        /* 잎 — 줄기 자란 후 펴짐 */
        @keyframes lv-leaf-open {
          0%   { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .lv-leaf-left {
          transform-origin: 120px 150px;
          transform-box: fill-box;
          opacity: 0;
          animation: lv-leaf-open 0.5s ease-out 1.0s forwards;
        }
        .lv-leaf-right {
          transform-origin: 120px 142px;
          transform-box: fill-box;
          opacity: 0;
          animation: lv-leaf-open 0.5s ease-out 1.2s forwards;
        }
        .lv-tip {
          opacity: 0;
          animation: lv-leaf-open 0.4s ease-out 0.9s forwards;
        }

        /* 점 3개 wave */
        @keyframes lv-home-dot-kf {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
          40%           { opacity: 1;   transform: translateY(-5px); }
        }
        .lv-home-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #2f6d4f;
          animation: lv-home-dot-kf 1.2s ease-in-out infinite;
        }
        .lv-home-dot-1 { animation-delay: 0s; }
        .lv-home-dot-2 { animation-delay: 0.18s; }
        .lv-home-dot-3 { animation-delay: 0.36s; }
      `}</style>
    </div>
  );
}
