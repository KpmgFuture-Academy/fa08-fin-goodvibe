/**
 * 농가가 참여 중인 사업 목록을 backend `/ville-project?farmer_id=...` 에서 동적으로 받음.
 * 예전엔 BusinessScreen 안에서 PRJ2026LC / PRJ2026PUB 두 사업을 하드코딩했지만,
 * 다른 농가/시드에서도 작동하도록 항상 backend 응답을 사용.
 */

import { getApiBaseUrl } from "./data-source";

export type ProjectActivity = {
  activity_id: string;
  activity_name: string;
  start_date: string | null;
  end_date: string | null;
};

export type FarmerProject = {
  prj_id: string;
  project_id: string;
  prj_name: string;
  exec_year: number | null;
  biz_name: string;
  group_no: number | null;
  ville_id: string;
  activities: ProjectActivity[];
};

export async function fetchFarmerProjects(farmer_id: string): Promise<FarmerProject[]> {
  if (!farmer_id) return [];
  const url = new URL("/ville-project", getApiBaseUrl());
  url.searchParams.set("farmer_id", farmer_id);
  try {
    const resp = await fetch(url.toString(), { cache: "no-store" });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { items?: FarmerProject[] };
    return data.items || [];
  } catch {
    return [];
  }
}
