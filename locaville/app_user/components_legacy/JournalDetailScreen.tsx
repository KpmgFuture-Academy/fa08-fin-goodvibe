"use client";

/** 영농일지 상세 화면 — 농가가 자기 기록을 확인하는 화면.
 *
 * 농가용 톤: 시스템 코드/IT 용어 노출 없음. 한 줄 요약 + 메모 + 사진 3 카드로 단순화.
 * 사진이 없으면 "사진 추가하기" 액션 노출 — 누락 사진을 즉시 보완할 수 있게.
 */

import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, ChevronLeft, MapPin, Mic, PenLine } from "lucide-react";
import { getEvidenceTypeLabel, getParcelDisplayLabel, getStatusLabel } from "@/lib/display-labels";
import { formatDiaryDate } from "@/lib/diary-service";
import { getEvidenceRecordsByIds } from "@/lib/evidence-service";
import type { DiaryRecord } from "@/lib/diary-types";
import type { EvidenceRecord } from "@/lib/evidence-types";

type Screen =
  | "home"
  | "voiceInput"
  | "manualInput"
  | "photoInput"
  | "saveComplete"
  | "journal"
  | "business"
  | "help"
  | "settings"
  | "journalDetail"
  | "businessDetail"
  | "splash"
  | "loginSelect"
  | "manualLogin";

interface JournalDetailScreenProps {
  record: DiaryRecord | null;
  navigate: (screen: Screen) => void;
}

// 농가에게 직관적인 입력 방식 라벨 + 아이콘.
function getInputMethodInfo(record: DiaryRecord): { label: string; Icon: typeof Mic } {
  const source = `${record.input_type_cd || ""} ${record.input_method || ""}`.toLowerCase();
  if (source.includes("voice") || source.includes("chat")) return { label: "음성으로 기록", Icon: Mic };
  if (source.includes("photo")) return { label: "사진으로 기록", Icon: Camera };
  return { label: "직접 입력", Icon: PenLine };
}

/**
 * work_detail 이 농가 발화/입력인지, backend 자동 생성 placeholder 인지 판별.
 * 자동 생성 패턴:
 *   - "기타에서 GENERAL 작업 기록" (음성에서 todo 매칭 실패 시 fallback)
 *   - "X에서 [대문자/숫자 코드] 작업 기록" 류
 *   - GENERAL / V0001 등 시스템 코드 단독 포함
 * 자동 텍스트면 isAuto=true 와 함께 친화 안내문 반환.
 */
function humanizeWorkDetail(detail?: string | null): { text: string; isAuto: boolean } {
  const trimmed = (detail || "").trim();
  if (!trimmed) return { text: "따로 적어둔 내용이 없어요.", isAuto: true };

  // "X에서 Y 작업 기록" 형태 (Y 는 영문 대문자/숫자 코드)
  if (/^.+에서\s+[A-Z0-9_]+\s+작업\s+기록$/.test(trimmed)) {
    return { text: "따로 적어둔 내용이 없어요.", isAuto: true };
  }
  // GENERAL 같은 시스템 코드만 포함된 짧은 텍스트
  if (trimmed.length < 40 && /\b(GENERAL|V0001|UNKNOWN)\b/.test(trimmed)) {
    return { text: "따로 적어둔 내용이 없어요.", isAuto: true };
  }

  return { text: trimmed, isAuto: false };
}

export default function JournalDetailScreen({ record, navigate }: JournalDetailScreenProps) {
  const [linkedEvidence, setLinkedEvidence] = useState<EvidenceRecord[]>([]);

  useEffect(() => {
    let mounted = true;
    if (!record || record.linked_evidence_ids.length === 0) {
      setLinkedEvidence([]);
      return () => {
        mounted = false;
      };
    }

    void getEvidenceRecordsByIds(record.linked_evidence_ids)
      .then((items) => {
        if (!mounted) return;
        const rows = items
          .map((item) => item.record)
          .filter((item): item is EvidenceRecord => Boolean(item))
          .sort((a, b) => b.captured_at.localeCompare(a.captured_at));
        setLinkedEvidence(rows);
      })
      .catch(() => {
        if (mounted) setLinkedEvidence([]);
      });

    return () => {
      mounted = false;
    };
  }, [record?.diary_id, record?.linked_evidence_ids.join(",")]);

  const summaryWorkName = useMemo(() => record?.work_stage_detail || record?.work_stage || "-", [record]);
  const summaryField = useMemo(
    () => getParcelDisplayLabel({ field_id: record?.field_id, parcel_no: record?.parcel_no, fallback: record?.field_address || "-" }),
    [record],
  );

  if (!record) {
    return (
      <div className="flex flex-col min-h-full pb-8 px-4 pt-8">
        <p className="text-muted-foreground">기록을 찾을 수 없습니다.</p>
        <button onClick={() => navigate("journal")} className="mt-4 bg-primary text-primary-foreground py-3 rounded-xl">
          목록으로
        </button>
      </div>
    );
  }

  const input = getInputMethodInfo(record);
  const InputIcon = input.Icon;
  const photoCount = linkedEvidence.length;

  return (
    <div className="flex flex-col pb-8" style={{ background: "#ffffff", minHeight: "100vh" }}>
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4 border-b" style={{ borderColor: "var(--line-soft)", background: "#ffffff" }}>
        <button onClick={() => navigate("journal")} className="p-2 rounded-xl bg-card border border-border">
          <ChevronLeft className="w-6 h-6 text-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">영농기록</h1>
          <p className="text-sm text-muted-foreground">{formatDiaryDate(record)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-5">
        {/* 카드 1: 한 줄 요약 — 필지 + 작업명 + 저장/입력 라인 */}
        <div className="bg-card border border-primary/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
            <MapPin className="w-4 h-4" />
            <span className="font-bold" style={{ color: "var(--ink-soft)" }}>{summaryField}</span>
          </div>
          <p className="mt-2 text-xl font-extrabold leading-snug break-keep" style={{ color: "var(--ink)" }}>
            {summaryWorkName}
          </p>
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-sm" style={{ color: "var(--ink-soft)" }}>
            <CheckCircle2 className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <span className="font-bold">{getStatusLabel(record.status)}</span>
            <span style={{ color: "var(--muted-2)" }}>·</span>
            <InputIcon className="w-4 h-4" style={{ color: "var(--muted)" }} />
            <span>{input.label}</span>
          </div>
        </div>

        {/* 카드 2: 작업 메모 — 농가가 직접 적은 내용. 시스템 자동 텍스트면 친화 안내. */}
        {(() => {
          const memo = humanizeWorkDetail(record.work_detail);
          return (
            <div className="jt-mobile-card rounded-2xl p-4">
              <h3 className="text-base font-bold mb-2" style={{ color: "var(--ink)" }}>작업 메모</h3>
              <p
                className={memo.isAuto ? "text-base" : "text-base leading-relaxed whitespace-pre-wrap break-keep"}
                style={{ color: memo.isAuto ? "var(--muted)" : "var(--ink-soft)" }}
              >
                {memo.text}
              </p>
            </div>
          );
        })()}

        {/* 카드 3: 사진 — 있으면 썸네일 grid, 없으면 추가 액션 노출 */}
        <div className="jt-mobile-card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold" style={{ color: "var(--ink)" }}>
              사진 {photoCount > 0 && <span style={{ color: "var(--muted)" }}>({photoCount}장)</span>}
            </h3>
          </div>
          {photoCount === 0 ? (
            <div className="text-center py-6 rounded-xl border border-dashed border-border" style={{ background: "var(--bg-soft)" }}>
              <Camera className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--muted-2)" }} />
              <p className="text-sm" style={{ color: "var(--muted)" }}>아직 등록된 사진이 없어요</p>
              <button
                onClick={() => navigate("photoInput")}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                <Camera className="w-4 h-4" />
                사진 추가하기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {linkedEvidence.map((evidence) => (
                <div key={evidence.evidence_id} className="flex flex-col gap-1">
                  {evidence.image_url ? (
                    <img
                      src={evidence.image_url}
                      alt={getEvidenceTypeLabel(evidence.evidence_type)}
                      className="w-full aspect-square object-cover rounded-lg border border-border"
                    />
                  ) : (
                    <div className="w-full aspect-square rounded-lg border border-border flex items-center justify-center" style={{ background: "var(--bg-soft)" }}>
                      <Camera className="w-8 h-8" style={{ color: "var(--muted-2)" }} />
                    </div>
                  )}
                  <p className="text-xs font-bold text-center break-keep" style={{ color: "var(--ink-soft)" }}>
                    {getEvidenceTypeLabel(evidence.evidence_type)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
