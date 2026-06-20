"use client";

/** 폰 흔들림 측정 — DeviceMotion API.
 *
 *  - 3초 sliding window 동안 가속도 변동(std) 측정
 *  - 안정: std < STABLE_THRESHOLD (1.5 m/s²)
 *  - 흔들림: std > SHAKE_THRESHOLD (2.5 m/s²)
 *  - iOS 13+ 는 `DeviceMotionEvent.requestPermission()` 필요 — 사용자 제스처 후 호출
 */

import { useEffect, useRef, useState } from "react";

const WINDOW_MS = 3000;
const STABLE_THRESHOLD = 1.5;
const SHAKE_THRESHOLD = 2.5;

export type MotionLevel = "stable" | "moderate" | "shaking";
export type MotionState = {
  level: MotionLevel;
  stdev: number;
  /** 권한이 필요한데 아직 요청 안 됨 (iOS) */
  needsPermission: boolean;
  /** 디바이스가 motion 자체를 지원 안 함 (대부분 데스크톱 브라우저) */
  unsupported: boolean;
};

type Sample = { t: number; mag: number };

function classify(stdev: number): MotionLevel {
  if (stdev < STABLE_THRESHOLD) return "stable";
  if (stdev > SHAKE_THRESHOLD) return "shaking";
  return "moderate";
}

export function useDeviceMotion(options?: { enabled?: boolean }): MotionState & {
  requestPermission: () => Promise<boolean>;
} {
  const enabled = options?.enabled !== false;
  const samplesRef = useRef<Sample[]>([]);
  const [state, setState] = useState<MotionState>({
    level: "stable",
    stdev: 0,
    needsPermission: false,
    unsupported: false,
  });

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const Event = (window as unknown as { DeviceMotionEvent?: typeof DeviceMotionEvent }).DeviceMotionEvent;
    if (!Event) {
      setState((s) => ({ ...s, unsupported: true }));
      return;
    }

    // iOS 13+ : 권한 요청 필요. 사용자 제스처 안에서 requestPermission() 호출해야.
    type DMEWithReq = typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const needsPermission = typeof (Event as DMEWithReq).requestPermission === "function";
    if (needsPermission) {
      setState((s) => ({ ...s, needsPermission: true }));
      // 사용자 제스처가 별도로 권한 요청해야 — 여기선 listener 부착 안 함.
      return;
    }

    function onMotion(e: DeviceMotionEvent) {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
      const now = Date.now();
      samplesRef.current.push({ t: now, mag });
      samplesRef.current = samplesRef.current.filter((s) => now - s.t <= WINDOW_MS);
      const mags = samplesRef.current.map((s) => s.mag);
      if (mags.length < 5) return;
      const mean = mags.reduce((a, b) => a + b, 0) / mags.length;
      const variance = mags.reduce((a, b) => a + (b - mean) ** 2, 0) / mags.length;
      const stdev = Math.sqrt(variance);
      setState((s) => ({ ...s, stdev, level: classify(stdev), needsPermission: false }));
    }

    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [enabled]);

  async function requestPermission(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    type DMEWithReq = typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const DME = (window as unknown as { DeviceMotionEvent?: DMEWithReq }).DeviceMotionEvent;
    if (!DME || typeof DME.requestPermission !== "function") return true;
    try {
      const result = await DME.requestPermission();
      if (result === "granted") {
        setState((s) => ({ ...s, needsPermission: false }));
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  return { ...state, requestPermission };
}
