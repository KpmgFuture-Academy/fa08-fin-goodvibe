"use client";

/** 기록 도우미 모드 — helper 가 "도와주러 가기" 활성 시 effective farmer_id 가
 *  recipient 의 amo_regno 로 자동 swap 되도록 전역 컨텍스트를 제공.
 *
 *  사용 패턴:
 *    const { effectiveFarmerId, isHelperMode, recipientName } = useHelperMode();
 *    const todos = await getTodayTodos(effectiveFarmerId, ...);
 *
 *  - 본인 알림 / helper role 조회 / weather 등 "내" 정보는 SAMPLE_USER_CONTEXT.farmer_id 그대로
 *  - todo / diary / evidence / parcel 등 데이터 R/W 는 useHelperMode().effectiveFarmerId
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { FarmHelperPair } from "./farm-helper-service";
import { SAMPLE_USER_CONTEXT } from "./sample-user-context";

export type HelperModeContextValue = {
  /** 데이터 작업 시 사용할 farmer_id (도움 모드 ON 이면 recipient 의 amo_regno). */
  effectiveFarmerId: string;
  /** 화면에 표시할 사람 이름 (도움 모드 ON 이면 recipient_name). */
  effectiveFarmerName: string;
  /** 본인의 farmer_id (변경 안 됨). */
  selfFarmerId: string;
  /** 도움 모드 활성 상태. */
  isHelperMode: boolean;
  /** 본인 helper role. */
  role: "helper" | "recipient" | "none";
  /** 현재 활성/대기 pair (있으면). */
  pair: FarmHelperPair | null;
};

const HelperModeContext = createContext<HelperModeContextValue | null>(null);

export function HelperModeProvider({
  role,
  pair,
  modeOn,
  children,
}: {
  role: "helper" | "recipient" | "none";
  pair: FarmHelperPair | null;
  /** helper 가 "도와주러 가기" 활성화한 상태. */
  modeOn: boolean;
  children: ReactNode;
}) {
  const value = useMemo<HelperModeContextValue>(() => {
    const self = SAMPLE_USER_CONTEXT.farmer_id;
    // 도움 모드는 다음 조건이 모두 충족돼야 effective:
    //   - role === "helper"
    //   - modeOn === true (사용자가 토글 ON)
    //   - pair.is_active (양방향 동의 완료)
    //   - recipient_amo_regno 가 backend 응답에 있음
    const isHelperMode = !!(
      role === "helper" &&
      modeOn &&
      pair?.is_active &&
      pair?.recipient_amo_regno
    );
    const effective = isHelperMode ? (pair?.recipient_amo_regno || self) : self;
    const effectiveName = isHelperMode
      ? (pair?.recipient_name || SAMPLE_USER_CONTEXT.farmer_name)
      : SAMPLE_USER_CONTEXT.farmer_name;
    return {
      effectiveFarmerId: effective,
      effectiveFarmerName: effectiveName,
      selfFarmerId: self,
      isHelperMode,
      role,
      pair,
    };
  }, [role, pair, modeOn]);

  return <HelperModeContext.Provider value={value}>{children}</HelperModeContext.Provider>;
}

export function useHelperMode(): HelperModeContextValue {
  const ctx = useContext(HelperModeContext);
  if (!ctx) {
    // Provider 밖에서 호출되면 본인 정보로 폴백 — 화면이 깨지지 않게.
    return {
      effectiveFarmerId: SAMPLE_USER_CONTEXT.farmer_id,
      effectiveFarmerName: SAMPLE_USER_CONTEXT.farmer_name,
      selfFarmerId: SAMPLE_USER_CONTEXT.farmer_id,
      isHelperMode: false,
      role: "none",
      pair: null,
    };
  }
  return ctx;
}
