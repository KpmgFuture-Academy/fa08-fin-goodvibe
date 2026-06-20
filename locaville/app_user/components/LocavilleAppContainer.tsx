"use client";

/**
 * LocavilleAppContainer — 데이터 컨테이너.
 * useLocavilleData 로 LocavilleData 를 조립해 표현용 셸(LocavilleApp)에 주입하고,
 * 모드 영속화 · 알림 읽음 · 도우미 모드 전환 · 로그아웃을 lib/ 서비스에 배선한다.
 */

import { useCallback, useEffect, useState } from "react";

import LocavilleApp from "@/components/LocavilleApp";
import { useLocavilleData } from "@/lib/use-locaville-data";
import { applyFontScaleToBody } from "@/lib/preferences";
import { hasSampleLogin, resetSampleUser, SAMPLE_USER_CONTEXT } from "@/lib/sample-user-context";
import { markAllFarmerNotificationsRead, markFarmerNotificationRead } from "@/lib/notification-service";
import { approveHelperPair } from "@/lib/farm-helper-service";

type UiMode = "easy" | "standard";
const MODE_KEY = "locaville:ui-mode";

function readStoredMode(): UiMode | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(MODE_KEY);
  return v === "easy" || v === "standard" ? v : null;
}
function writeStoredMode(m: UiMode | null) {
  if (typeof window === "undefined") return;
  if (m) window.localStorage.setItem(MODE_KEY, m);
  else window.localStorage.removeItem(MODE_KEY);
}

export default function LocavilleAppContainer() {
  const { data, loading, helper, setEffectiveFarmerId, reload } = useLocavilleData();

  // 재방문이면 저장된 모드로 바로 home. 첫 진입이면 null → 로그인/모드선택.
  const [initialUiMode] = useState<UiMode | null>(() => readStoredMode());
  // 로그인은 됐지만 모드 미선택 (예: 직접 로그인 직후) → LocavilleApp 가 modeChoose 로 시작.
  const [initialLoggedIn] = useState<boolean>(() => hasSampleLogin());

  // 새 디자인은 고정 px + 쉬운/표준 모드로 가독성을 처리한다(HANDOFF 원칙).
  // 예전 전역 글자 스케일(data-large-text)은 고정 px 레이아웃을 깨뜨리므로 항상 해제.
  useEffect(() => { applyFontScaleToBody("normal"); }, []);

  const onPickMode = useCallback((m: UiMode) => {
    writeStoredMode(m); // 모드(레이아웃 밀도)만 저장 — 전역 글자 스케일과 분리.
  }, []);

  const onToggleHelper = useCallback(
    (on: boolean) => {
      if (on && helper.pair?.is_active && helper.pair.recipient_amo_regno) {
        setEffectiveFarmerId(helper.pair.recipient_amo_regno);
      } else {
        setEffectiveFarmerId(SAMPLE_USER_CONTEXT.farmer_id);
      }
    },
    [helper.pair, setEffectiveFarmerId],
  );

  const onNotifRead = useCallback((notice_no: number) => {
    void markFarmerNotificationRead(SAMPLE_USER_CONTEXT.farmer_id, notice_no).catch(() => {});
  }, []);
  const onNotifReadAll = useCallback(() => {
    void markAllFarmerNotificationsRead(SAMPLE_USER_CONTEXT.farmer_id).catch(() => {});
  }, []);

  const onLogout = useCallback(() => {
    writeStoredMode(null);
    resetSampleUser();
  }, []);

  // 기록 도우미 — 본인 동의가 아직 안 된 pending pair 감지.
  const pair = helper.pair;
  const consentPending =
    !!pair &&
    ((helper.role === "helper" && !pair.helper_approved_at) ||
      (helper.role === "recipient" && !pair.recipient_approved_at));

  const onApproveHelper = useCallback(async () => {
    if (!pair) return;
    try {
      await approveHelperPair(SAMPLE_USER_CONTEXT.farmer_id, pair.helper_user_no, pair.help_seq);
      reload();
    } catch {
      /* 동의 실패 — 다음 polling 에서 재시도 */
    }
  }, [pair, reload]);

  // 60초마다 알림/데이터 가벼운 polling (legacy 와 동일 주기).
  useEffect(() => {
    const t = setInterval(() => reload(), 60_000);
    return () => clearInterval(t);
  }, [reload]);

  return (
    <LocavilleApp
      data={data}
      loading={loading}
      initialUiMode={initialUiMode}
      initialLoggedIn={initialLoggedIn}
      onPickMode={onPickMode}
      onToggleHelper={onToggleHelper}
      onNotifRead={onNotifRead}
      onNotifReadAll={onNotifReadAll}
      onLogout={onLogout}
      onDataChanged={reload}
      helperRole={helper.role}
      helperPair={helper.pair}
      consentPending={consentPending}
      onApproveHelper={onApproveHelper}
    />
  );
}
