"use client";

/**
 * chief-resources — 이장님 4탭이 공유하는 캐시 리소스 정의(키 + 패처).
 *
 * 키는 Shell 의 prefetch 와 각 페이지의 useCachedResource 가 **동일하게** 써야 캐시가 적중한다.
 * 그래서 여기 한 곳에서만 (key, fetcher) 를 정의해 양쪽이 import 한다.
 */
import {
  getAdminSummary,
  getAdminTodoStatus,
  getRecentEvidence,
  getLaggardFarmers,
  listFarmHelpers,
  getAiRecommendation,
  getVillageDetail,
} from "./admin-api";
import { fetchVillageProjects } from "./projects";
import { INBOX_EVIDENCE_LIMIT, INBOX_LAGGARD_LIMIT } from "./chief-adapters";
import { prefetch } from "./chief-cache";

export const chiefRes = {
  summary: () => ({ key: "chief:summary", fetcher: () => getAdminSummary() }),
  todoStatus: () => ({ key: "chief:todo-status", fetcher: () => getAdminTodoStatus() }),
  recentEvidence: () => ({ key: "chief:recent-evidence", fetcher: () => getRecentEvidence(INBOX_EVIDENCE_LIMIT) }),
  laggards: () => ({ key: "chief:laggards", fetcher: () => getLaggardFarmers(7, INBOX_LAGGARD_LIMIT) }),
  aiRec: () => ({ key: "chief:ai-recommendation", fetcher: () => getAiRecommendation() }),
  helpers: (villeId: string) => ({ key: `chief:helpers:${villeId}`, fetcher: () => listFarmHelpers(villeId) }),
  projects: (villeId: string) => ({ key: `chief:projects:${villeId}`, fetcher: () => fetchVillageProjects({ ville_id: villeId }) }),
  villageDetail: (villeId: string) => ({ key: `chief:village-detail:${villeId}`, fetcher: () => getVillageDetail(villeId) }),
};

/** 접속 시(Shell) 4페이지 공용 데이터를 미리 받아둔다. ville 종속 항목은 villeId 준비 후. */
export function prefetchChiefAll(villeId: string | null | undefined) {
  for (const r of [chiefRes.summary(), chiefRes.todoStatus(), chiefRes.recentEvidence(), chiefRes.laggards(), chiefRes.aiRec()]) {
    prefetch(r.key, r.fetcher as () => Promise<unknown>);
  }
  if (villeId) {
    for (const r of [chiefRes.helpers(villeId), chiefRes.projects(villeId), chiefRes.villageDetail(villeId)]) {
      prefetch(r.key, r.fetcher as () => Promise<unknown>);
    }
  }
}
