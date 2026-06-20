/**
 * locaville-view-model — lib/ 서비스의 도메인 타입을 nextjs_app 디자인 컴포넌트가
 * 기대하는 "표현용(view)" 타입으로 변환하는 순수 매퍼 모음.
 *
 * 디자인 컴포넌트들은 자체 경량 타입(ParcelRef / DiaryRecord(view) / Business(view) ...)을
 * 정의해 두었고, page.tsx 데이터 컨테이너가 이 매퍼들로 LocavilleData 를 조립한다.
 * 새 타입이 컴포넌트에 정의돼 있으므로 여기서는 type-only import 로 가져온다.
 */

import type { TodoItemApi } from "@/lib/todo-service";
import type { FarmerParcel } from "@/lib/parcel-service";
import type { DiaryRecord as LibDiaryRecord } from "@/lib/diary-types";
import type { FarmerProject } from "@/lib/business-service";
import type { FarmerNotification } from "@/lib/notification-service";
import type { FarmJobOption } from "@/lib/farm-job-service";
import { groupJobsByCategory } from "@/lib/farm-job-service";
import type { EvidenceRecord } from "@/lib/evidence-types";
import type { WeatherResponse } from "@/lib/weather-service";
import { getEvidenceTypeLabel, getParcelDisplayLabel, getJobCodeLabel, refineRetakeMessage } from "@/lib/display-labels";
import { getApiBaseUrl } from "@/lib/data-source";

import type { ParcelRef, RetakeRequest } from "@/components/HomeScreen";
import type { DiaryRecord as ViewDiary, ActivityProgress } from "@/components/JournalScreen";
import type { Business as ViewBusiness, BusinessActivity } from "@/components/BusinessScreens";
import type { NotificationItem } from "@/components/NotificationPanel";
import type { JobGroup } from "@/components/ManualInputScreen";
import type { FaqItem } from "@/components/HelpScreen";

// ─────────────────────────────────────────────────────────────────────────────
// 필지(parcel)
// ─────────────────────────────────────────────────────────────────────────────
// parcel_usage 코드 → 한글(백엔드 usage_label 이 비었을 때 폴백).
const USAGE_CODE_LABEL: Record<string, string> = { RPA: "논", FPA: "밭", FRA: "과수원", OPA: "기타" };

export function toParcelRef(p: FarmerParcel): ParcelRef {
  // kind = 한글 용도 라벨("논"). raw 코드("RPA")는 절대 노출하지 않음.
  const kind = (p.usage_label || USAGE_CODE_LABEL[(p.usage || "").toUpperCase()] || "논").trim();
  // label = 필지 고유 이름 우선("앞논"). 없으면 주소(addr_2), 그것도 없으면 용도(kind).
  // "N번" 같은 순번 표기는 쓰지 않음(요청).
  const name = (p.parcel_name || "").trim();
  const label = name || (p.addr_2 || "").trim() || kind;
  return { parcel_no: p.parcel_no, label, kind };
}

export function toParcelRefs(parcels: FarmerParcel[]): ParcelRef[] {
  return parcels.map(toParcelRef);
}

// ─────────────────────────────────────────────────────────────────────────────
// 영농일지 (lib DiaryRecord → view DiaryRecord)
// ─────────────────────────────────────────────────────────────────────────────
/** evidence.image_url → 화면용 절대 URL. 상대('/uploads/..')면 API base 를 붙인다. */
function resolveEvidenceImageUrl(raw?: string | null): string {
  const u = (raw || "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${getApiBaseUrl()}${u}`;
  return u;
}

export function toViewDiary(r: LibDiaryRecord, imgById?: Map<string, string>): ViewDiary {
  const method: ViewDiary["method"] =
    r.input_method === "manual" || r.input_method === "photo" ? r.input_method : "voice";
  const parcel = getParcelDisplayLabel({
    field_id: r.field_id,
    parcel_no: r.parcel_no,
    text: r.field_address,
    fallback: r.field_address,
  });
  const work = r.work_stage_detail || r.work_detail || r.work_stage || getJobCodeLabel(r.job_cd, "기록");
  const ids = Array.isArray(r.linked_evidence_ids) ? r.linked_evidence_ids : [];
  // 연결된 증빙 중 이미지 URL 이 있는 첫 장을 썸네일로 사용 (없으면 화면이 placeholder 처리).
  let thumbUrl: string | undefined;
  if (imgById) {
    for (const id of ids) {
      const u = imgById.get(id);
      if (u) { thumbUrl = u; break; }
    }
  }
  return {
    diary_id: r.diary_id,
    work_date: r.work_date,
    work,
    parcel,
    detail: r.work_detail || r.work_stage_detail || "",
    evidence: ids,
    thumbUrl,
    method,
  };
}

export function toViewDiaries(records: LibDiaryRecord[], evidence: EvidenceRecord[] = []): ViewDiary[] {
  // evidence_id → 이미지 URL 맵. 일지의 linked_evidence_ids 를 이걸로 썸네일에 연결.
  const imgById = new Map<string, string>();
  for (const e of evidence) {
    const url = resolveEvidenceImageUrl(e.image_url);
    if (e.evidence_id && url) imgById.set(e.evidence_id, url);
  }
  return [...records]
    .sort((a, b) => (a.work_date < b.work_date ? 1 : a.work_date > b.work_date ? -1 : 0))
    .map((r) => toViewDiary(r, imgById));
}

// ─────────────────────────────────────────────────────────────────────────────
// 활동 진행률 (ActivityProgress) — 사업 활동 × 일지/할일 집계로 best-effort 산출.
// 정식 요건 횟수 테이블이 아직 없어, target = (완료 일지 수 + 남은 할 일 수) 휴리스틱.
// ─────────────────────────────────────────────────────────────────────────────
// (활동 아이콘은 화면에서 JobIcon(name) 라인 아이콘으로 렌더 — 이모지 미사용.)

// 활동별 필요한 촬영 횟수(시행지침 기준). 활동명 키워드로 매칭 — backend 미배포 상황에서도
// 정확한 횟수가 나오도록. evidence_type 의 ROUND/START·END/BAG·SPREADING 스킴과 동일한 수.
const REQUIRED_PHOTO_COUNT: { kw: string; count: number }[] = [
  { kw: "걸러대기", count: 4 }, // 논물 얕게 걸러대기 (AWD) — 마른 논바닥 4회
  { kw: "AWD", count: 4 },
  { kw: "물떼기", count: 2 },   // 중간 물떼기 — 시작/완료
  { kw: "바이오차", count: 2 }, // 바이오차 투입 — 포대/투입
];
function knownRequiredCount(name: string): number | null {
  const upper = (name || "").toUpperCase();
  const hit = REQUIRED_PHOTO_COUNT.find((r) => name.includes(r.kw) || upper.includes(r.kw.toUpperCase()));
  return hit ? hit.count : null;
}

/**
 * 활동 진행률 산출. target(요건 횟수) 우선순위:
 *  1) 활동별 시행지침 요건 횟수(논물 4 / 물떼기 2 / 바이오차 2 …) — 활동명 키워드 매칭.
 *  2) todo.required_evidence_types 개수(백엔드 매핑).
 *  3) 폴백 휴리스틱(완료 일지 + 남은 할 일).
 * done = 그 활동으로 제출된 증빙/일지 수(요건 횟수 상한).
 */
export function buildActivityProgress(
  projects: FarmerProject[],
  todos: TodoItemApi[],
  diaries: LibDiaryRecord[],
  evidence: EvidenceRecord[] = [],
): ActivityProgress[] {
  const out: ActivityProgress[] = [];
  const seen = new Set<string>();
  for (const proj of projects) {
    for (const act of proj.activities) {
      if (seen.has(act.activity_id)) continue;
      seen.add(act.activity_id);

      const evCount = evidence.filter((e) => e.activity_id === act.activity_id).length;
      const diaryCount = diaries.filter(
        (d) => d.activity_id === act.activity_id || (act.activity_name && d.work_stage_detail?.includes(act.activity_name)),
      ).length;
      const submitted = Math.max(evCount, diaryCount);

      // required_evidence_types(todo) 개수 — backend 가 4회 등을 내려주면 이게 정확.
      const requiredTypes = new Set<string>();
      for (const t of todos) {
        if (t.activity_id === act.activity_id) (t.required_evidence_types || []).forEach((e) => requiredTypes.add(e));
      }

      const known = knownRequiredCount(act.activity_name);
      let target: number;
      let done: number;
      if (known != null) {
        target = known;
        done = Math.min(submitted, known);
      } else if (requiredTypes.size > 0) {
        const submittedTypes = new Set(
          evidence.filter((e) => e.activity_id === act.activity_id && e.evidence_type).map((e) => e.evidence_type),
        );
        target = requiredTypes.size;
        done = Math.min([...requiredTypes].filter((rt) => submittedTypes.has(rt)).length || submitted, target);
      } else {
        const pending = todos.filter(
          (t) => t.activity_id === act.activity_id && t.computed_status !== "completed" && t.status !== "completed",
        ).length;
        done = diaryCount;
        target = Math.max(done + pending, 1);
        if (done === 0 && pending === 0) continue;
      }
      out.push({ name: act.activity_name, done, target, emoji: "" });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 참여 사업 (FarmerProject → view Business)
// ─────────────────────────────────────────────────────────────────────────────
export function toBusiness(proj: FarmerProject, todos: TodoItemApi[], diaries: LibDiaryRecord[]): ViewBusiness {
  const relatedTodos = todos.filter(
    (t) => (t.prj_id === proj.prj_id || t.project_id === proj.project_id) && t.computed_status !== "completed" && t.status !== "completed",
  );
  const activities: BusinessActivity[] = proj.activities.map((act) => {
    const sampleTodo = todos.find((t) => t.activity_id === act.activity_id);
    const evidence = sampleTodo?.required_evidence_types?.length
      ? sampleTodo.required_evidence_types.map((e) => getEvidenceTypeLabel(e)).join(" · ")
      : "사진";
    const done = diaries.filter((d) => d.activity_id === act.activity_id).length;
    const pending = todos.filter(
      (t) => t.activity_id === act.activity_id && t.computed_status !== "completed" && t.status !== "completed",
    ).length;
    const period =
      act.start_date && act.end_date ? `${act.start_date} ~ ${act.end_date}` : "기간 상시";
    return {
      activity_name: act.activity_name,
      desc: period,
      evidence,
      done,
      target: Math.max(done + pending, done || pending ? 1 : 0),
    };
  });
  const items = Array.from(new Set(proj.activities.map((a) => a.activity_name))).slice(0, 4);
  return {
    prj_id: proj.prj_id,
    name: proj.prj_name,
    biz_name: proj.biz_name,
    exec_year: proj.exec_year ?? new Date().getFullYear(),
    items,
    activities,
    relatedTodoCount: relatedTodos.length,
  };
}

export function toBusinesses(projects: FarmerProject[], todos: TodoItemApi[], diaries: LibDiaryRecord[]): ViewBusiness[] {
  return projects.map((p) => toBusiness(p, todos, diaries));
}

// ─────────────────────────────────────────────────────────────────────────────
// 알림 (FarmerNotification → NotificationItem)
// ─────────────────────────────────────────────────────────────────────────────
function relativeWhen(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffMin = Math.round((Date.now() - t) / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function toNotificationItem(n: FarmerNotification): NotificationItem {
  return {
    notice_no: n.notice_no,
    content_cd: n.content_cd,
    title: n.title,
    content: n.content,
    when: relativeWhen(n.sent_at ?? n.reg_at),
    read: !!n.read_at,
  };
}

export function toNotificationItems(items: FarmerNotification[]): NotificationItem[] {
  return items.map(toNotificationItem);
}

// ─────────────────────────────────────────────────────────────────────────────
// 작업 분류 (FarmJobOption[] → JobGroup[])
// ─────────────────────────────────────────────────────────────────────────────
export function toJobGroups(jobs: FarmJobOption[]): JobGroup[] {
  return groupJobsByCategory(jobs).map((g) => ({
    category: g.category as string,
    label: g.label,
    // start/end_mmdd 를 그대로 전달 — ManualInputScreen 이 제철 우선 노출에 사용.
    jobs: g.jobs.map((j) => ({
      job_cd: j.job_cd,
      job_name: j.job_name,
      start_mmdd: j.start_mmdd ?? null,
      end_mmdd: j.end_mmdd ?? null,
    })),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 재촬영 요청 (EvidenceRecord[] → RetakeRequest | null)
// 이장님이 status=retake_required 로 돌려보낸 증빙 1건을 매핑.
// ─────────────────────────────────────────────────────────────────────────────
export function buildRetake(evidence: EvidenceRecord[]): RetakeRequest | null {
  const hit = evidence.find((e) => {
    const s = (e.status || "").toLowerCase();
    return s === "retake_required" || s.includes("retake") || s.includes("reject");
  });
  if (!hit) return null;
  return {
    evidence_id: hit.evidence_id,
    parcel_no: hit.parcel_no || undefined,
    job_name: getJobCodeLabel(hit.job_cd, hit.activity_type) || undefined,
    // "다른 활동 사진…" 류의 추상 사유는 작업 기준 구체 문장으로 풀어쓴다 (표시 전용).
    message: refineRetakeMessage(hit.user_message, hit.job_cd, hit.activity_type),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 날씨 (WeatherResponse → 헤더 표시용 { label, tmp, iconSrc })
// 레거시 WeatherWidget 의 sky/pty 매핑을 inline 으로 재사용. 아이콘은 public/weather-icons/*.svg.
// ─────────────────────────────────────────────────────────────────────────────
function isNight(): boolean {
  const h = new Date().getHours();
  return h >= 19 || h < 6;
}

export function toWeatherView(w: WeatherResponse | null): { label: string; tmp: number; iconSrc: string } {
  const night = isNight();
  let iconFile = "cloudy.svg";
  let label = "날씨 확인 중";
  if (w && !w.error) {
    switch (w.pty) {
      case "1":
      case "4":
        iconFile = "rain.svg";
        label = "비";
        break;
      case "2":
        iconFile = "sleet.svg";
        label = "비/눈";
        break;
      case "3":
        iconFile = "snow.svg";
        label = "눈";
        break;
      default:
        switch (w.sky) {
          case "1":
            iconFile = night ? "clear-night.svg" : "clear-day.svg";
            label = night ? "맑은 밤" : "맑음";
            break;
          case "3":
            iconFile = night ? "partly-cloudy-night.svg" : "partly-cloudy-day.svg";
            label = "구름 많음";
            break;
          case "4":
            iconFile = "cloudy.svg";
            label = "흐림";
            break;
          default:
            iconFile = night ? "clear-night.svg" : "clear-day.svg";
            label = "맑음";
        }
    }
  }
  const tmpNum = w?.tmp != null ? Number.parseInt(String(w.tmp), 10) : NaN;
  return { label, tmp: Number.isFinite(tmpNum) ? tmpNum : 0, iconSrc: `/weather-icons/${iconFile}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 날짜 라벨 — "6월 4일 목요일" / YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────────────────
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
export function formatDateLabel(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}
export function toYmd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 도움말 FAQ — 정적 큐레이션. (RAG 챗은 HelpScreen 의 answerFor 로 별도 연결.)
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_FAQ: FaqItem[] = [
  { q: "사진은 어떻게 올리나요?", a: "홈 화면에서 '사진 찍기'를 누르고, 안내에 맞춰 작물을 비춘 뒤 찍으면 자동으로 이장님께 전달돼요." },
  { q: "말로 기록해도 되나요?", a: "네. '말로 남기기'를 누르고 오늘 한 일을 편하게 말씀하시면, 앱이 정리해서 영농일지로 저장해요." },
  { q: "이장님이 사진을 다시 찍어달라고 했어요.", a: "홈 화면 맨 위에 다시 찍기 안내가 보여요. 그 카드를 누르면 어떤 사진을 다시 찍어야 하는지 알려드려요." },
  { q: "오늘 할 일은 어디서 보나요?", a: "홈 화면 가운데 '오늘 할 일' 카드에 가장 급한 일이 표시돼요. 'N건 더 보기'로 나머지도 볼 수 있어요." },
  { q: "참여 중인 사업이 궁금해요.", a: "아래 '참여 사업' 탭에서 올해 참여 중인 사업과 해야 할 활동, 진행률을 확인할 수 있어요." },
  { q: "글씨가 너무 작아요.", a: "설정에서 '간단하게 보기'를 켜면 글씨와 버튼이 크게 바뀌어 보기 편해져요." },
];
