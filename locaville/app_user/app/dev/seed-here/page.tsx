"use client";

/** 데모용 — 현재 위치(GPS)를 농가 필지 좌표로 등록.
 *  폰/PC 브라우저로 시연 위치에서 이 페이지 열고 버튼 한 번 누르면 끝.
 *
 *  URL:  /dev/seed-here
 *  기본 등록 대상: 김영수 (farmer_id=1110000002), 첫 필지(parcel_no=1)
 */

import { useState } from "react";
import { getApiBaseUrl } from "@/lib/data-source";
import { SAMPLE_USER_CONTEXT } from "@/lib/sample-user-context";

type State =
  | { kind: "idle" }
  | { kind: "loading"; step: string }
  | { kind: "ok"; lat: number; lng: number; accuracy: number; result: Record<string, unknown> }
  | { kind: "error"; message: string };

export default function SeedHerePage() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [farmerId, setFarmerId] = useState<string>(SAMPLE_USER_CONTEXT.farmer_id);
  const [parcelNo, setParcelNo] = useState<string>("");

  async function handleSeed() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ kind: "error", message: "이 브라우저는 위치 정보를 지원하지 않아요" });
      return;
    }
    setState({ kind: "loading", step: "현재 위치를 받아오는 중…" });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setState({ kind: "loading", step: "백엔드에 등록하는 중…" });
        try {
          const url = new URL("/demo/seed-parcel-gps", getApiBaseUrl());
          const body: Record<string, unknown> = {
            farmer_id: farmerId.trim() || SAMPLE_USER_CONTEXT.farmer_id,
            lat: latitude,
            lng: longitude,
          };
          const trimmedParcel = parcelNo.trim();
          if (trimmedParcel) body.parcel_no = Number(trimmedParcel);
          const resp = await fetch(url.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`백엔드 응답 ${resp.status}: ${text}`);
          }
          const result = (await resp.json()) as Record<string, unknown>;
          setState({ kind: "ok", lat: latitude, lng: longitude, accuracy, result });
        } catch (e) {
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : "등록 실패",
          });
        }
      },
      (err) => {
        let msg = "위치를 못 받았어요";
        if (err.code === err.PERMISSION_DENIED) msg = "위치 사용을 허용해 주세요";
        else if (err.code === err.POSITION_UNAVAILABLE) msg = "위치 신호가 없어요";
        else if (err.code === err.TIMEOUT) msg = "위치 받기 시간 초과";
        setState({ kind: "error", message: msg });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        padding: "32px 20px",
        gap: 16,
        background: "#faf6ea",
        fontFamily: "Pretendard, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1f2a1f", margin: 0 }}>
        🌾 시드 좌표 등록 (데모)
      </h1>
      <p style={{ fontSize: 14, color: "#5e6356", margin: 0, lineHeight: 1.5 }}>
        지금 계신 자리(브라우저 GPS)를 농가의 필지 좌표로 박습니다.
        <br />
        PhotoGuardOverlay 의 거리 검증 테스트용입니다.
      </p>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#5e6356" }}>farmer_id</span>
        <input
          value={farmerId}
          onChange={(e) => setFarmerId(e.target.value)}
          placeholder="1110000002 (김영수)"
          style={{
            padding: "10px 12px",
            border: "1px solid #d2c9b1",
            borderRadius: 10,
            fontSize: 15,
            background: "#fff",
          }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#5e6356" }}>parcel_no (선택, 비우면 첫 필지)</span>
        <input
          value={parcelNo}
          onChange={(e) => setParcelNo(e.target.value)}
          placeholder="비우면 MIN(parcel_no)"
          style={{
            padding: "10px 12px",
            border: "1px solid #d2c9b1",
            borderRadius: 10,
            fontSize: 15,
            background: "#fff",
          }}
        />
      </label>

      <button
        type="button"
        onClick={() => void handleSeed()}
        disabled={state.kind === "loading"}
        style={{
          padding: "18px",
          background: state.kind === "loading" ? "#9aaa9a" : "#2f6d4f",
          color: "#fff",
          border: "none",
          borderRadius: 14,
          fontSize: 18,
          fontWeight: 800,
          cursor: state.kind === "loading" ? "not-allowed" : "pointer",
          marginTop: 8,
        }}
      >
        {state.kind === "loading" ? state.step : "📍 내 위치를 시드로 등록"}
      </button>

      {state.kind === "ok" && (
        <div
          style={{
            padding: 14,
            background: "#e3f0e6",
            border: "1px solid #2f6d4f",
            borderRadius: 12,
            color: "#1c4a36",
          }}
        >
          <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>✅ 등록 성공</p>
          <pre
            style={{
              margin: "8px 0 0",
              fontSize: 12,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
{`현재 위치: (${state.lat.toFixed(6)}, ${state.lng.toFixed(6)})
정확도: ±${Math.round(state.accuracy)}m

백엔드 응답:
${JSON.stringify(state.result, null, 2)}`}
          </pre>
        </div>
      )}

      {state.kind === "error" && (
        <div
          style={{
            padding: 14,
            background: "#ffe2e2",
            border: "1px solid #a12b2b",
            borderRadius: 12,
            color: "#7a1f1f",
          }}
        >
          <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>⚠️ 실패</p>
          <p style={{ margin: "6px 0 0", fontSize: 13 }}>{state.message}</p>
        </div>
      )}

      <p style={{ fontSize: 11, color: "#8a8e7e", marginTop: "auto" }}>
        등록 후 확인: <code>GET /farmer/{farmerId || "1110000002"}/parcels</code>
      </p>
    </div>
  );
}
