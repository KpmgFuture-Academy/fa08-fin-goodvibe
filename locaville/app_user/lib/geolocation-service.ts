"use client";

/** 브라우저 GPS 위치 가져오기 — PhotoGuardOverlay 의 위치 단계에 사용.
 *
 *  - watchPosition 으로 실시간 추적 (정지 가능)
 *  - HTTPS 필수 (모바일 브라우저), localhost 는 허용
 *  - 권한 거부 / 신호 없음 / 타임아웃 모두 graceful — UI 가 bypass 옵션 노출
 */

import { useEffect, useState } from "react";

export type GpsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; lat: number; lng: number; accuracy: number; timestamp: number }
  | { status: "denied" }
  | { status: "unavailable" }
  | { status: "timeout" };

export function useGeolocation(options?: { enabled?: boolean; highAccuracy?: boolean }): GpsState {
  const enabled = options?.enabled !== false;
  const highAccuracy = options?.highAccuracy !== false;
  const [state, setState] = useState<GpsState>({ status: "idle" });

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unavailable" });
      return;
    }
    setState({ status: "loading" });

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          status: "ok",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setState({ status: "denied" });
        else if (err.code === err.POSITION_UNAVAILABLE) setState({ status: "unavailable" });
        else if (err.code === err.TIMEOUT) setState({ status: "timeout" });
        else setState({ status: "unavailable" });
      },
      {
        enableHighAccuracy: highAccuracy,
        maximumAge: 5_000,
        timeout: 15_000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, highAccuracy]);

  return state;
}
