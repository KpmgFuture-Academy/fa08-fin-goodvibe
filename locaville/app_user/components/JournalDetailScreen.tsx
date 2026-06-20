"use client";

/** JournalDetailScreen — 기록 자세히 보기. 연결된 증빙 사진을 실제로 불러와 보여준다. */

import { useEffect, useState } from "react";
import { ChevronLeft, Camera, Mic, PenLine } from "lucide-react";
import type { DiaryRecord } from "./JournalScreen";
import { getEvidenceRecordsByIds } from "@/lib/evidence-service";
import type { EvidenceRecord } from "@/lib/evidence-types";
import { getEvidenceTypeLabel } from "@/lib/display-labels";

const METHOD = {
  voice: { t: "말로", Icon: Mic }, manual: { t: "직접", Icon: PenLine }, photo: { t: "사진", Icon: Camera },
} as const;

interface JournalDetailScreenProps {
  record: DiaryRecord | null;
  /** "6월 4일 목요일" */
  dateLabel: (ymd: string) => string;
  navigate: (screen: string) => void;
}

// 시스템 자동 생성 문구를 사람친화 문구로. 빈 값/코드성 문구는 부드럽게 안내.
function humanizeDetail(detail: string, work: string): string {
  const d = (detail || "").trim();
  if (!d) return "따로 적어둔 내용이 없어요.";
  // "1번 논에서 MID_DRAINAGE_END 작업 기록" 같은 코드 잔재 정리.
  if (/^[A-Z0-9_]+$/.test(d)) return work || "작업을 기록했어요.";
  return d;
}

export default function JournalDetailScreen({ record, dateLabel, navigate }: JournalDetailScreenProps) {
  const [photos, setPhotos] = useState<EvidenceRecord[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  const ids = record?.evidence ?? [];
  const idsKey = ids.join(",");
  useEffect(() => {
    if (!record || ids.length === 0) { setPhotos([]); return; }
    let mounted = true;
    setLoadingPhotos(true);
    void getEvidenceRecordsByIds(ids)
      .then((rows) => {
        if (!mounted) return;
        setPhotos(rows.map((r) => r.record).filter((r): r is EvidenceRecord => !!r && !!r.image_url));
      })
      .catch(() => mounted && setPhotos([]))
      .finally(() => mounted && setLoadingPhotos(false));
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  if (!record) return null;
  const m = METHOD[record.method];
  const MIcon = m.Icon;
  const detail = humanizeDetail(record.detail, record.work);

  return (
    <div className="flex min-h-full flex-col bg-[var(--lv-bg)]">
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-[var(--lv-bg)] px-3.5 pb-3 pt-4">
        <button onClick={() => navigate("journal")} aria-label="뒤로" className="rounded-full border border-[var(--lv-line)] bg-white p-2.5"><ChevronLeft size={24} className="text-[color:var(--lv-ink)]" /></button>
        <h1 className="text-[20px] font-extrabold text-[color:var(--lv-ink)]">기록 자세히 보기</h1>
      </div>
      <div className="flex flex-col gap-4 px-4 pb-10 pt-2">
        {/* 증빙 사진 — 실제 이미지 */}
        {photos.length > 0 ? (
          <div>
            <p className="mb-2 pl-0.5 text-[14px] font-extrabold text-[color:var(--lv-ink)]">올린 사진 {photos.length}장</p>
            <div className={`grid gap-2.5 ${photos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {photos.map((p) => (
                <div key={p.evidence_id} className="overflow-hidden rounded-[18px] border border-[var(--lv-line-soft)] bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image_url} alt={getEvidenceTypeLabel(p.evidence_type)} className="aspect-[4/3] w-full object-cover" />
                  <p className="px-3 py-2 text-[12px] font-bold text-[color:var(--lv-ink-soft)] [word-break:keep-all]">{getEvidenceTypeLabel(p.evidence_type)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : loadingPhotos ? (
          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-[18px] bg-[var(--lv-bg-soft)]">
            <span className="text-[14px] font-bold text-[color:var(--lv-muted)]">사진 불러오는 중…</span>
          </div>
        ) : record.evidence.length > 0 ? (
          // id 는 있는데 이미지 로드 실패 — placeholder.
          <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[18px] bg-[repeating-linear-gradient(135deg,#eef1ea,#eef1ea_14px,#e3e7dd_14px,#e3e7dd_28px)]">
            <span className="font-mono text-[13px] font-bold text-[color:var(--lv-muted)]">증빙 사진</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-[var(--lv-warn)] bg-[var(--lv-warn-soft)] p-4">
            <div className="flex items-center gap-2.5">
              <Camera size={22} className="shrink-0 text-[color:var(--lv-warn)]" />
              <p className="text-[15px] font-bold text-[color:var(--lv-ink)]">이 기록에는 사진이 없어요</p>
            </div>
            <button onClick={() => navigate("photoInput")} className="shrink-0 rounded-xl bg-[var(--lv-warn)] px-3 py-2 text-[14px] font-extrabold text-white">사진 추가</button>
          </div>
        )}

        <div className="rounded-2xl border border-[var(--lv-line-soft)] bg-white p-[18px] shadow-[0_1px_2px_rgba(31,42,31,0.04),0_6px_14px_rgba(31,42,31,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[24px] font-extrabold text-[color:var(--lv-ink)]">{record.work}</p>
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[var(--lv-accent-soft)] px-2.5 py-1 text-[13px] font-extrabold text-[color:var(--lv-primary)]"><MIcon size={14} />{m.t}로 남김</span>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-[16px] text-[color:var(--lv-muted)]">날짜 <span className="ml-2 font-bold text-[color:var(--lv-ink)]">{dateLabel(record.work_date)}</span></p>
            <p className="text-[16px] text-[color:var(--lv-muted)]">위치 <span className="ml-2 font-bold text-[color:var(--lv-ink)]">{record.parcel}</span></p>
          </div>
          <div className="mt-3 border-t border-[var(--lv-line-soft)] pt-3">
            <p className="mb-1.5 text-[13px] font-bold text-[color:var(--lv-muted)]">적은 내용</p>
            <p className="text-[17px] leading-relaxed text-[color:var(--lv-ink)] [word-break:keep-all]">{detail}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
