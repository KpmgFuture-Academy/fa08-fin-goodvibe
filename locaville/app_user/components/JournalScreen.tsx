"use client";

/**
 * JournalScreen — 영농일지 = 요건 추적기 + 기록 보관함.
 * 올해 사업 활동 진행률(보조금 직결, 최상단) → 최근 기록 → 지난 기록(월 이동·필터).
 * 수천 건 확장 대응: 월 단위 로드 + 필터(전체/사진만).
 */

import { useMemo, useState } from "react";
import { Plus, ChevronLeft, ChevronRight, Image as ImageIcon, PenLine, Check } from "lucide-react";
import { JobIcon } from "./JobIcon";

export interface DiaryRecord {
  diary_id: string;
  work_date: string;   // YYYY-MM-DD
  work: string;
  parcel: string;
  detail: string;
  evidence: string[];
  /** 연결된 증빙 사진 중 첫 장의 이미지 URL (있으면 썸네일로 표시). */
  thumbUrl?: string;
  method: "voice" | "manual" | "photo";
}
export interface ActivityProgress {
  name: string;
  done: number;
  target: number;
  emoji: string;
}

interface JournalScreenProps {
  records: DiaryRecord[];
  /** 올해 사업 활동 달성도. */
  progress: ActivityProgress[];
  todayYmd: string;
  easy?: boolean;
  navigate: (screen: string) => void;
  onOpenRecord: (r: DiaryRecord) => void;
}

function relDate(ymd: string, todayYmd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  const t = new Date(`${todayYmd}T00:00:00`);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const diff = Math.round((t.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
}
function sideLabel(r: DiaryRecord) {
  if (r.evidence.length > 0) return { t: "사진 있음", warn: false, soft: false };
  return { t: r.method === "voice" ? "음성 작성" : "직접 작성", warn: false, soft: true };
}

// 시스템 작업명("논물관리-논물얕게걸러대기") → 사용자 라벨(카테고리 분리 + 띄어쓰기 보정).
const NAME_FIX: Record<string, string> = {
  논물얕게걸러대기: "논물 얕게 걸러대기",
  중간물떼기: "중간 물떼기",
};
function splitActivityName(raw: string): { category: string | null; name: string } {
  const idx = raw.indexOf("-");
  if (idx < 0) return { category: null, name: NAME_FIX[raw] || raw };
  const tail = raw.slice(idx + 1);
  return { category: raw.slice(0, idx), name: NAME_FIX[tail] || tail };
}

/** 기록 썸네일 — thumbUrl 있으면 실제 사진, 로드 실패/없으면 아이콘 placeholder 로 폴백. */
function DiaryThumb({ url, hasEvidence, easy, sizeClass }: { url?: string; hasEvidence: boolean; easy: boolean; sizeClass: string }) {
  const [broken, setBroken] = useState(false);
  const base = `relative ${sizeClass} shrink-0 overflow-hidden rounded-[16px] flex items-center justify-center`;
  if (url && !broken) {
    return (
      <div className={`${base} bg-[var(--lv-bg-soft)]`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`${base} ${hasEvidence ? "bg-[repeating-linear-gradient(135deg,#eef1ea,#eef1ea_6px,#e3e7dd_6px,#e3e7dd_12px)]" : "border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)]"}`}>
      {hasEvidence ? <ImageIcon size={easy ? 20 : 17} className="text-[color:var(--lv-muted)]" /> : <PenLine size={easy ? 18 : 15} className="text-[color:var(--lv-muted-2)]" />}
    </div>
  );
}

export default function JournalScreen({ records, progress, todayYmd, easy = false, navigate, onOpenRecord }: JournalScreenProps) {
  const [todayY, todayM] = todayYmd.split("-").map(Number);
  const [month, setMonth] = useState({ y: todayY, m: todayM });
  const [filter, setFilter] = useState<"all" | "photo">("all");

  const behind = progress.filter((a) => a.done < a.target).sort((a, b) => (b.target - b.done) - (a.target - a.done))[0];
  const recent = useMemo(() => [...records].sort((a, b) => b.work_date.localeCompare(a.work_date)).slice(0, 2), [records]);

  const monthKey = `${month.y}-${String(month.m).padStart(2, "0")}`;
  const monthRecords = useMemo(() =>
    records.filter((r) => r.work_date.slice(0, 7) === monthKey)
      .filter((r) => (filter === "photo" ? r.evidence.length > 0 : true))
      .sort((a, b) => b.work_date.localeCompare(a.work_date)),
    [records, monthKey, filter]);

  const groups: { date: string; items: DiaryRecord[] }[] = [];
  monthRecords.forEach((r) => {
    const g = groups.find((x) => x.date === r.work_date);
    if (g) g.items.push(r); else groups.push({ date: r.work_date, items: [r] });
  });

  const shift = (d: number) => setMonth(({ y, m }) => { const nm = m + d; return { y: y + Math.floor((nm - 1) / 12), m: ((nm - 1 + 12) % 12) + 1 }; });
  const isThisMonth = month.y === todayY && month.m === todayM;
  const thumb = easy ? "h-[72px] w-[72px]" : "h-[60px] w-[60px]";

  const Row = (r: DiaryRecord, last: boolean) => {
    const lbl = sideLabel(r);
    const { category, name } = splitActivityName(r.work);
    return (
      <button key={r.diary_id} onClick={() => onOpenRecord(r)}
        className={`flex min-h-[48px] w-full items-center gap-3 text-left active:bg-[var(--lv-bg-soft)] ${last ? "" : "border-b border-[var(--lv-line-soft)]"} ${easy ? "px-4 py-3.5" : "px-4 py-3"}`}>
        <DiaryThumb url={r.thumbUrl} hasEvidence={r.evidence.length > 0} easy={easy} sizeClass={thumb} />
        <div className="min-w-0 flex-1">
          <p className={`font-semibold leading-tight text-[color:var(--lv-ink)] [word-break:keep-all] ${easy ? "text-[17px]" : "text-[16px]"}`}>{name}</p>
          <p className="mt-1 text-[14px] font-medium text-[color:var(--lv-ink-soft)] [word-break:keep-all]">{r.parcel}{category ? ` · ${category}` : ""}</p>
        </div>
        {lbl.soft
          ? <span className="shrink-0 whitespace-nowrap text-[14px] font-medium text-[color:var(--lv-muted)]">{lbl.t}</span>
          : <span className="shrink-0 whitespace-nowrap rounded-full bg-[var(--lv-accent-soft)] px-2.5 py-1 text-[14px] font-semibold text-[color:var(--lv-primary)]">{lbl.t}</span>}
        <ChevronRight size={20} className="shrink-0 text-[color:var(--lv-muted)]" />
      </button>
    );
  };

  return (
    <div className="lv-stagger min-h-full bg-[var(--lv-bg)] pb-10">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
        <h1 className="text-[28px] font-bold tracking-tight text-[color:var(--lv-ink)]">영농일지</h1>
        {!easy && (
          <button onClick={() => navigate("home")} className="flex min-h-[48px] items-center gap-1.5 rounded-full bg-[var(--lv-primary)] px-4 text-[15px] font-semibold text-white"><Plus size={18} />일지 쓰기</button>
        )}
      </div>
      {easy && (
        <div className="px-5 pb-3 pt-1">
          <button onClick={() => navigate("home")} className="flex min-h-[72px] w-full items-center justify-center gap-2.5 rounded-[20px] bg-[var(--lv-primary)] text-[20px] font-bold tracking-tight text-white active:translate-y-px"><Plus size={24} />오늘 한 일 남기기</button>
        </div>
      )}

      {/* 올해 사업 활동 (최상단) */}
      <div className={`mx-5 mt-1 rounded-[28px] bg-[var(--lv-card)] ${easy ? "p-5" : "p-4"} shadow-[0_2px_8px_rgba(23,35,27,0.05)]`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className={`font-bold text-[color:var(--lv-ink)] ${easy ? "text-[19px]" : "text-[18px]"}`}>올해 사업 활동</h2>
          <span className="text-[14px] font-semibold text-[color:var(--lv-muted)]">총 {records.length}건 기록</span>
        </div>
        <div className={`mb-3.5 rounded-2xl px-4 py-3 ${behind ? "bg-[var(--lv-warn-soft)]" : "bg-[var(--lv-accent-soft)]"}`}>
          {behind ? (
            <>
              <p className={`font-bold leading-snug text-[color:var(--lv-ink)] [word-break:keep-all] ${easy ? "text-[16px]" : "text-[15px]"}`}>{splitActivityName(behind.name).name}</p>
              <p className={`mt-0.5 font-medium leading-snug text-[color:var(--lv-warn)] [word-break:keep-all] ${easy ? "text-[15px]" : "text-[14px]"}`}>
                {behind.target - behind.done}회 더 기록하면 올해 목표를 채워요
              </p>
            </>
          ) : (
            <p className={`inline-flex items-center gap-1.5 font-semibold text-[color:var(--lv-primary)] ${easy ? "text-[16px]" : "text-[15px]"}`}>
              <Check size={17} className="shrink-0" /> 올해 활동을 모두 채웠어요
            </p>
          )}
        </div>
        <div className={`flex flex-col ${easy ? "gap-4" : "gap-3"}`}>
          {progress.map((a) => {
            const pct = Math.min(100, Math.round((a.done / a.target) * 100));
            const ok = a.done >= a.target;
            const { category, name } = splitActivityName(a.name);
            return (
              <div key={a.name} className="flex items-center gap-2.5">
                <span className="flex w-[22px] shrink-0 justify-center"><JobIcon name={a.name} size={18} className="text-[color:var(--lv-primary)]" /></span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-end justify-between gap-2">
                    <span className="min-w-0">
                      {category && <span className="block text-[13px] font-medium text-[color:var(--lv-muted)]">{category}</span>}
                      <span className={`block font-semibold leading-tight text-[color:var(--lv-ink)] [word-break:keep-all] ${easy ? "text-[16px]" : "text-[15px]"}`}>{name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 pb-px">
                      <span className={`rounded-full px-2 py-0.5 text-[14px] font-semibold ${ok ? "bg-[var(--lv-accent-soft)] text-[color:var(--lv-primary)]" : "bg-[var(--lv-surface-soft)] text-[color:var(--lv-ink-soft)]"}`}>{ok ? "완료" : "진행 중"}</span>
                      <span className="text-[14px] font-semibold text-[color:var(--lv-ink-soft)]">{a.done}/{a.target}회</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--lv-line-soft)]">
                    <div className="h-full rounded-full bg-[var(--lv-primary)]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 최근 기록 */}
      <p className="px-6 pb-2 pt-[22px] text-[14px] font-semibold tracking-[0.02em] text-[color:var(--lv-ink-soft)]">최근 기록</p>
      <div className="mx-5 overflow-hidden rounded-[24px] bg-[var(--lv-card)] shadow-[0_2px_8px_rgba(23,35,27,0.05)]">
        {recent.map((r, i) => Row(r, i === recent.length - 1))}
      </div>

      {/* 지난 기록 (월 이동·필터) */}
      <p className="px-6 pt-[22px] text-[14px] font-semibold tracking-[0.02em] text-[color:var(--lv-ink-soft)]">지난 기록</p>
      <div className="flex items-center justify-between px-5 pb-1.5 pt-2">
        <div className="flex items-center gap-1.5">
          <button onClick={() => shift(-1)} aria-label="이전 달" className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--lv-line)] bg-white"><ChevronLeft size={20} className="text-[color:var(--lv-ink)]" /></button>
          <span className="min-w-[96px] text-center text-[18px] font-bold text-[color:var(--lv-ink)]">{month.y}년 {month.m}월</span>
          <button onClick={() => shift(1)} disabled={isThisMonth} aria-label="다음 달" className={`flex h-12 w-12 items-center justify-center rounded-full border border-[var(--lv-line)] bg-white ${isThisMonth ? "opacity-40" : ""}`}><ChevronRight size={20} className="text-[color:var(--lv-ink)]" /></button>
        </div>
        <span className="text-[14px] font-semibold text-[color:var(--lv-muted)]">{monthRecords.length}건</span>
      </div>
      {!easy && (
        <div className="flex gap-2 px-5 pb-2 pt-1">
          {(["all", "photo"] as const).map((k) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`min-h-[48px] rounded-full px-[18px] text-[14px] font-semibold ${filter === k ? "bg-[var(--lv-primary)] text-white" : "border border-[var(--lv-line)] bg-white text-[color:var(--lv-ink-soft)]"}`}>
              {k === "all" ? "전체" : "사진만"}
            </button>
          ))}
        </div>
      )}

      {monthRecords.length === 0 ? (
        <div className="mx-5 px-4 py-8 text-center text-[16px] font-medium text-[color:var(--lv-ink-soft)]">이 달에는 기록이 없어요.</div>
      ) : (
        <div className="mt-1 flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.date}>
              <p className="px-6 pb-[7px] text-[14px] font-semibold text-[color:var(--lv-muted)]">{relDate(g.date, todayYmd)}</p>
              <div className="mx-5 overflow-hidden rounded-[24px] bg-[var(--lv-card)] shadow-[0_2px_8px_rgba(23,35,27,0.05)]">
                {g.items.map((r, i) => Row(r, i === g.items.length - 1))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Claude Code: records = diary-service(listDiaries). progress = todo/activity
   요건과 diary 집계로 산출(요건 횟수는 business-service 활동 target 사용 권장). */
