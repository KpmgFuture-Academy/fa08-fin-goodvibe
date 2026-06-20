"use client";

/** 도우미 모드 진입/복귀 인터스티셜 — 트랙터가 매연 뿜으며 가로지르는 풀스크린 트랜지션.
 *
 *  - direction="enter" : 도와드리러 가는 중 (트랙터가 좌→우)
 *  - direction="leave" : 우리 농가로 돌아오는 중 (트랙터가 우→좌)
 *
 *  LocavilleApp 이 2.5초 setTimeout 으로 자동 숨김.
 */

export function HelperModeTransitionScreen({
  direction = "enter",
  recipientName,
}: {
  direction?: "enter" | "leave";
  recipientName?: string;
}) {
  const isEnter = direction === "enter";
  const bgGradient = isEnter
    ? "linear-gradient(180deg, #f8c763 0%, #e89a3b 70%, #b8801f 100%)"
    : "linear-gradient(180deg, #8ec99a 0%, #4d8d6a 70%, #2f6d4f 100%)";
  const title = isEnter ? "도와드리러 가는 중…" : "우리 농가로 돌아오는 중…";
  const subtitle = isEnter
    ? recipientName
      ? `${recipientName}님 기록을 함께 적어 드릴 준비를 하고 있어요`
      : "잠시만 기다려 주세요"
    : "수고하셨어요";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: bgGradient,
        zIndex: 90,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "0 24px",
        color: "#fff",
        textAlign: "center",
        overflow: "hidden",
      }}
    >
      {/* 멀리 보이는 풀밭/언덕 — 화면 하단 1/3 */}
      <svg
        viewBox="0 0 390 120"
        preserveAspectRatio="none"
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: 120,
          opacity: 0.55,
        }}
      >
        <path d="M0,40 Q90,10 180,30 T390,28 L390,120 L0,120 Z" fill="#ffffff" opacity="0.18" />
        <path d="M0,70 Q120,40 240,60 T390,60 L390,120 L0,120 Z" fill="#ffffff" opacity="0.28" />
      </svg>

      {/* 트랙터 컨테이너 — direction 별로 좌↔우 가로지름 */}
      <div
        className={isEnter ? "lv-train-enter" : "lv-train-leave"}
        style={{
          position: "relative",
          width: 220,
          height: 140,
          marginTop: -20,
        }}
      >
        {/* 매연 — 배기관 위로 떠오르며 fade */}
        <span className="lv-puff lv-puff-1" />
        <span className="lv-puff lv-puff-2" />
        <span className="lv-puff lv-puff-3" />
        <span className="lv-puff lv-puff-4" />

        {/* 트랙터 SVG — 트랙터 앞면이 진행 방향을 향하도록 좌우 반전.
            SVG 원본은 앞이 왼쪽이라, enter(좌→우) 일 때 scaleX(-1) 로 앞을 오른쪽으로 돌리고,
            leave(우→좌) 일 때는 그대로 둔다. */}
        <svg
          width="220"
          height="120"
          viewBox="0 0 220 120"
          style={{
            position: "absolute",
            left: 0,
            top: 24,
            transform: isEnter ? "scaleX(-1)" : "none",
          }}
          aria-hidden
        >
          {/* 배기관 (캐빈 앞쪽 위로 솟은 작은 굴뚝) */}
          <rect x="96" y="22" width="10" height="34" rx="2" fill="#2f3933" />
          <rect x="92" y="18" width="18" height="7" rx="2" fill="#1f2a23" />

          {/* 엔진 후드 (앞쪽 — 진행 방향) */}
          <rect x="40" y="56" width="68" height="30" rx="6" fill="#e85d4f" />
          <rect x="40" y="56" width="68" height="8" rx="6" fill="#ff7d6e" opacity="0.6" />
          {/* 엔진 그릴 */}
          <rect x="40" y="66" width="5" height="14" rx="2" fill="#2f3933" />
          <rect x="48" y="66" width="5" height="14" rx="2" fill="#2f3933" />

          {/* 운전석 캐빈 — 사다리꼴 지붕 + 본체 */}
          <path d="M108,56 L120,34 L160,34 L172,56 Z" fill="#c93f33" />
          <rect x="108" y="56" width="64" height="32" rx="4" fill="#c93f33" />
          {/* 캐빈 창 (전면) */}
          <path d="M120,52 L128,40 L152,40 L160,52 Z" fill="#ffe57a" />
          <rect x="115" y="60" width="52" height="22" rx="3" fill="#ffe57a" opacity="0.55" />
          {/* 캐빈 기둥 (창 가운데 세로선) */}
          <rect x="140" y="60" width="2" height="22" fill="#a83025" opacity="0.7" />

          {/* 헤드라이트 (앞쪽) */}
          <circle cx="40" cy="70" r="6" fill="#ffd24d" />
          <circle cx="40" cy="70" r="3" fill="#fff8d6" />

          {/* 앞 바퀴 (작음) */}
          <circle cx="62" cy="94" r="14" fill="#23272a" />
          <circle cx="62" cy="94" r="7" fill="#3a4046" />
          <circle cx="62" cy="94" r="3" fill="#fff" />

          {/* 뒤 바퀴 (큼 — 트랙터 특징) */}
          <circle cx="148" cy="88" r="24" fill="#23272a" />
          <circle cx="148" cy="88" r="12" fill="#3a4046" />
          <circle cx="148" cy="88" r="5" fill="#fff" />
          {/* 뒤 바퀴 트레드 (방사형 짧은 선) */}
          <g stroke="#1f2a23" strokeWidth="2.5" strokeLinecap="round">
            <line x1="148" y1="68" x2="148" y2="74" />
            <line x1="168" y1="88" x2="162" y2="88" />
            <line x1="148" y1="108" x2="148" y2="102" />
            <line x1="128" y1="88" x2="134" y2="88" />
            <line x1="162" y1="74" x2="158" y2="78" />
            <line x1="162" y1="102" x2="158" y2="98" />
            <line x1="134" y1="74" x2="138" y2="78" />
            <line x1="134" y1="102" x2="138" y2="98" />
          </g>
        </svg>
      </div>

      {/* 제목 + 부제 */}
      <h2
        style={{
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          margin: 0,
          textShadow: "0 2px 6px rgba(0,0,0,0.18)",
          zIndex: 1,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          margin: 0,
          color: "rgba(255, 255, 255, 0.94)",
          lineHeight: 1.55,
          textShadow: "0 1px 4px rgba(0,0,0,0.14)",
          zIndex: 1,
        }}
      >
        {subtitle}
      </p>

      {/* 점 3개 로딩 */}
      <div style={{ display: "flex", gap: 6, marginTop: 4, zIndex: 1 }}>
        <span className="lv-dot lv-dot-1" />
        <span className="lv-dot lv-dot-2" />
        <span className="lv-dot lv-dot-3" />
      </div>

      <style>{`
        /* 기차 가로지름 — 약간 위아래로 통통 튀는 느낌 */
        @keyframes lv-train-enter-kf {
          0%   { transform: translateX(-130%) translateY(0); }
          15%  { transform: translateX(-95%)  translateY(-3px); }
          30%  { transform: translateX(-60%)  translateY(0); }
          45%  { transform: translateX(-25%)  translateY(-3px); }
          60%  { transform: translateX(10%)   translateY(0); }
          75%  { transform: translateX(45%)   translateY(-3px); }
          100% { transform: translateX(130%)  translateY(0); }
        }
        @keyframes lv-train-leave-kf {
          0%   { transform: translateX(130%)  translateY(0); }
          15%  { transform: translateX(95%)   translateY(-3px); }
          30%  { transform: translateX(60%)   translateY(0); }
          45%  { transform: translateX(25%)   translateY(-3px); }
          60%  { transform: translateX(-10%)  translateY(0); }
          75%  { transform: translateX(-45%)  translateY(-3px); }
          100% { transform: translateX(-130%) translateY(0); }
        }
        .lv-train-enter { animation: lv-train-enter-kf 2.5s cubic-bezier(.4,0,.2,1) forwards; }
        .lv-train-leave { animation: lv-train-leave-kf 2.5s cubic-bezier(.4,0,.2,1) forwards; }

        /* 증기 — 굴뚝 위로 올라가며 커지고 사라짐 */
        @keyframes lv-puff-kf {
          0%   { transform: translate(0, 0) scale(0.4); opacity: 0; }
          20%  { opacity: 0.95; }
          100% { transform: translate(-10px, -70px) scale(1.4); opacity: 0; }
        }
        .lv-puff {
          position: absolute;
          left: 100px;
          top: 18px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #ffffff;
          opacity: 0;
          filter: blur(0.5px);
          animation: lv-puff-kf 1.2s ease-out infinite;
        }
        .lv-puff-1 { animation-delay: 0s; }
        .lv-puff-2 { animation-delay: 0.3s; left: 104px; }
        .lv-puff-3 { animation-delay: 0.6s; left: 98px; }
        .lv-puff-4 { animation-delay: 0.9s; left: 106px; }

        /* 로딩 점 */
        @keyframes lv-dot-kf {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
          40%           { opacity: 1;   transform: translateY(-4px); }
        }
        .lv-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ffffff;
          animation: lv-dot-kf 1.2s ease-in-out infinite;
        }
        .lv-dot-1 { animation-delay: 0s; }
        .lv-dot-2 { animation-delay: 0.18s; }
        .lv-dot-3 { animation-delay: 0.36s; }
      `}</style>
    </div>
  );
}
