"use client";

/**
 * use-locaville-data — nextjs_app 디자인 셸(LocavilleApp)이 기대하는 LocavilleData 를
 * lib/ 서비스에서 조립해 주입하는 데이터 컨테이너 훅.
 *
 * - 마운트 시 + effectiveFarmerId(도우미 모드) 변경 시 전체 재조회.
 * - 각 조회는 독립적으로 실패를 swallow (백엔드 미연결 시에도 화면이 깨지지 않게).
 */

import { useCallback, useEffect, useState } from "react";

import { getTodayTodos, type TodoItemApi } from "@/lib/todo-service";
import { fetchFarmerParcels, primeFarmerParcels } from "@/lib/parcel-service";
import { listDiaryRecords } from "@/lib/diary-service";
import type { DiaryRecord as LibDiaryRecord } from "@/lib/diary-types";
import { listEvidenceRecords } from "@/lib/evidence-service";
import { fetchFarmerProjects } from "@/lib/business-service";
import { fetchFarmJobOptions } from "@/lib/farm-job-service";
import { fetchFarmerNotifications } from "@/lib/notification-service";
import { fetchTodayWeather } from "@/lib/weather-service";
import { fetchCurrentHelperRole, type FarmHelperPair } from "@/lib/farm-helper-service";
import { fetchCurrentUserProfile } from "@/lib/user-profile-service";
import { SAMPLE_USER_CONTEXT } from "@/lib/sample-user-context";

import type { LocavilleData } from "@/components/LocavilleApp";
import {
  toParcelRefs,
  toViewDiaries,
  toBusinesses,
  toNotificationItems,
  toJobGroups,
  buildRetake,
  buildActivityProgress,
  toWeatherView,
  formatDateLabel,
  toYmd,
  DEFAULT_FAQ,
} from "@/lib/locaville-view-model";

const EMPTY_WEATHER = { label: "날씨 확인 중", tmp: 0, iconSrc: "/weather-icons/cloudy.svg" };

function emptyData(now: Date): LocavilleData {
  return {
    farmerId: SAMPLE_USER_CONTEXT.farmer_id,
    userName: SAMPLE_USER_CONTEXT.farmer_name || "농가",
    villageLabel: "서호마을",
    dateLabel: formatDateLabel(now),
    todayYmd: toYmd(now),
    weather: EMPTY_WEATHER,
    todos: [],
    parcels: [],
    retake: null,
    diary: [],
    progress: [],
    businesses: [],
    jobGroups: [],
    faq: DEFAULT_FAQ,
    notifications: [],
    helperRecipientName: null,
    advice: null,
  };
}

export interface HelperState {
  role: "helper" | "recipient" | "none";
  pair: FarmHelperPair | null;
  recipientName: string | null;
}

export function useLocavilleData() {
  const now = new Date();
  const [data, setData] = useState<LocavilleData>(() => emptyData(new Date()));
  const [loading, setLoading] = useState(true);
  const [helper, setHelper] = useState<HelperState>({ role: "none", pair: null, recipientName: null });
  // 도우미 모드 ON 시 recipient 의 farmer_id 로 데이터를 조회.
  const [effectiveFarmerId, setEffectiveFarmerId] = useState<string>(SAMPLE_USER_CONTEXT.farmer_id);

  const load = useCallback(async (farmerId: string) => {
    setLoading(true);
    const today = new Date();

    const [
      todosR,
      parcelsR,
      diaryR,
      evidenceR,
      projectsR,
      jobsR,
      notifR,
      weatherR,
      helperR,
      profileR,
    ] = await Promise.allSettled([
      getTodayTodos({ farmer_id: farmerId }),
      fetchFarmerParcels(farmerId),
      listDiaryRecords(),
      listEvidenceRecords({ farmer_id: farmerId }),
      fetchFarmerProjects(farmerId),
      fetchFarmJobOptions(),
      fetchFarmerNotifications(farmerId),
      fetchTodayWeather({ ville_id: SAMPLE_USER_CONTEXT.ville_id, crop_cd: "rice" }),
      // helper 관계는 항상 본인(SAMPLE_USER_CONTEXT) 기준. 도우미 모드 ON 으로 farmerId 가
      // recipient 로 바뀌어도 본인 user_no 로 fetch 해야 role === "helper" + recipientName 이 유지된다.
      fetchCurrentHelperRole(SAMPLE_USER_CONTEXT.farmer_id),
      fetchCurrentUserProfile(farmerId),
    ]);

    const ok = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
      r.status === "fulfilled" ? r.value : fallback;

    const allTodos = ok(todosR, [] as TodoItemApi[]);
    const todos = allTodos
      .filter((t) => t.computed_status !== "completed" && t.status !== "completed")
      .sort((a, b) => {
        const da = a.due_date ?? "9999-99-99";
        const db = b.due_date ?? "9999-99-99";
        return da < db ? -1 : da > db ? 1 : 0;
      });

    const parcels = ok(parcelsR, [] as Awaited<ReturnType<typeof fetchFarmerParcels>>);
    primeFarmerParcels(parcels);

    const diaryLib = ok(diaryR, [] as LibDiaryRecord[]);
    const evidence = ok(evidenceR, [] as Awaited<ReturnType<typeof listEvidenceRecords>>);
    const projects = ok(projectsR, [] as Awaited<ReturnType<typeof fetchFarmerProjects>>);
    const jobs = ok(jobsR, [] as Awaited<ReturnType<typeof fetchFarmJobOptions>>);
    const notifs = ok(notifR, [] as Awaited<ReturnType<typeof fetchFarmerNotifications>>);
    const weather = ok(weatherR, null);
    const helperRes = ok(helperR, { role: "none" as const, pair: null });
    const profile = ok(profileR, { user: null, village: null });

    // 홈 "기록 도와주러 가기" 카드 노출 권한 — 양측 동의가 끝난 활성 pair 의 helper 에게만.
    // (동의 대기 pair 는 HelperConsentModal 로만 안내하고, 일반 농민 홈에는 카드를 숨긴다.)
    const pairApproved = !!helperRes.pair?.helper_approved_at && !!helperRes.pair?.recipient_approved_at;
    const recipientName =
      helperRes.role === "helper" && helperRes.pair?.is_active && pairApproved
        ? helperRes.pair.recipient_name || `농가 ${helperRes.pair.recipient_user_no}`
        : null;
    setHelper({ role: helperRes.role, pair: helperRes.pair, recipientName });

    const villeName = profile.village?.ville_name || "서호마을";
    const bizName = projects[0]?.biz_name;
    const villageLabel = bizName ? `${villeName} · ${bizName}` : villeName;

    setData({
      farmerId,
      userName: SAMPLE_USER_CONTEXT.farmer_name || "농가",
      villageLabel,
      dateLabel: formatDateLabel(today),
      todayYmd: toYmd(today),
      weather: toWeatherView(weather),
      todos,
      parcels: toParcelRefs(parcels),
      retake: buildRetake(evidence),
      diary: toViewDiaries(diaryLib, evidence),
      progress: buildActivityProgress(projects, todos, diaryLib, evidence),
      businesses: toBusinesses(projects, todos, diaryLib),
      jobGroups: toJobGroups(jobs),
      faq: DEFAULT_FAQ,
      notifications: toNotificationItems(notifs),
      helperRecipientName: recipientName,
      advice: null, // 오늘 한마디 카드는 새 디자인에서 미사용(요청).
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(effectiveFarmerId);
  }, [load, effectiveFarmerId]);

  const reload = useCallback(() => void load(effectiveFarmerId), [load, effectiveFarmerId]);

  return { data, loading, helper, effectiveFarmerId, setEffectiveFarmerId, reload };
}
