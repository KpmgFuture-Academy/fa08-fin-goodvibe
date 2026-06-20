"use client";

/** 직접 입력 영농일지 작성 화면.
 *
 * 모든 선택지는 backend DB 에서 동적으로 가져옴:
 *   - 작업 종류: `/farm-job/list`
 *   - 필지/작물: `/farmer/{id}/parcels` (parcel.usage → 작물 라벨 변환)
 *
 * UI 구성 (모바일 톤 통일):
 *   1) 헤더 (← + "직접 입력하기")
 *   2) 선택한 할 일 안내 카드 (있으면)
 *   3) 정보 카드 — 날짜 / 필지 + 작물 (한 줄)
 *   4) 작업 종류 카드 — chips
 *   5) 메모 카드 — textarea
 *   6) Sticky CTA — 저장 버튼 (스크롤해도 하단 고정)
 */

import { useEffect, useMemo, useState } from "react";
import { Calendar, ChevronLeft, MapPin, Wheat, ClipboardEdit, Camera, RefreshCcw, X } from "lucide-react";
import { getDefaultWorkDate, saveManualDiaryRecord } from "@/lib/diary-service";
import type { DiaryRecord, ManualDiaryInput } from "@/lib/diary-types";
import type { TodoItemApi } from "@/lib/todo-service";
import { fetchFarmerParcels, type FarmerParcel } from "@/lib/parcel-service";
import { fetchFarmJobOptions, groupJobsByCategory, type FarmJobOption } from "@/lib/farm-job-service";
import { useHelperMode } from "@/lib/helper-mode-context";
import { uploadEvidenceFile } from "@/lib/evidence-service";
import type { EvidenceRecord } from "@/lib/evidence-types";
import { SAMPLE_PROJECT_CONTEXT } from "@/lib/sample-user-context";
import CompletionModal from "./CompletionModal";
import { PhotoLiveCoachOverlay } from "./PhotoLiveCoachOverlay";

type Screen =
  | "home" | "voiceInput" | "manualInput" | "photoInput" | "saveComplete"
  | "journal" | "business" | "help" | "settings"
  | "journalDetail" | "businessDetail" | "splash" | "loginSelect" | "manualLogin";

interface ManualInputScreenProps {
  navigate: (screen: Screen) => void;
  onDiarySaved: (input: ManualDiaryInput, record: DiaryRecord) => void | Promise<void>;
  recentUploadedEvidence?: unknown;  // 사용 안 함 — 향후 사진 흐름 통합 시 참고
  selectedTodo?: TodoItemApi | null;
}

function formatKoreanDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${days[date.getDay()]}요일`;
}

/** parcel.usage(RPA/DFA/...) 코드 → 농가 친화 작물명. */
function parcelToCropLabel(p: FarmerParcel): string {
  const usage = (p.usage || "").toUpperCase();
  if (usage === "RPA") return "벼";
  if (usage === "DFA") return "고추";
  if (usage === "FFA") return "과수";
  return "기타";
}

/** parcel → "1번 논(벼)" 같은 화면 표시 라벨. */
function parcelToFieldLabel(p: FarmerParcel): string {
  const usage = (p.usage || "").toUpperCase();
  const kind = usage === "RPA" ? "논" : usage === "DFA" ? "밭" : "필지";
  const crop = parcelToCropLabel(p);
  return `${p.parcel_no}번 ${kind} (${crop})`;
}

export default function ManualInputScreen({
  navigate,
  onDiarySaved,
  selectedTodo = null,
}: ManualInputScreenProps) {
  const { effectiveFarmerId } = useHelperMode();
  const [workDate] = useState(getDefaultWorkDate);
  const [workCd, setWorkCd] = useState("");
  const [selectedParcel, setSelectedParcel] = useState<FarmerParcel | null>(null);
  const [memo, setMemo] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [completedRecord, setCompletedRecord] = useState<DiaryRecord | null>(null);
  const [saving, setSaving] = useState(false);
  // 사진 첨부 (선택) — PhotoLiveCoachOverlay 로 친근한 카메라 UI 진입.
  // 셔터 후 즉시 evidence 업로드 → record id 받음 → 저장 시 linkedEvidenceText 로 diary 와 연결.
  const [attachedEvidence, setAttachedEvidence] = useState<EvidenceRecord | null>(null);
  const [showCoach, setShowCoach] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");

  // DB 에서 가져온 선택지
  const [jobOptions, setJobOptions] = useState<FarmJobOption[]>([]);
  const [parcels, setParcels] = useState<FarmerParcel[]>([]);

  useEffect(() => {
    let mounted = true;
    void fetchFarmJobOptions().then((opts) => mounted && setJobOptions(opts));
    void fetchFarmerParcels(effectiveFarmerId).then((rows) => {
      if (!mounted) return;
      setParcels(rows);
      // 기본 선택: 첫 필지
      if (rows.length > 0) setSelectedParcel((prev) => prev || rows[0]);
    });
    return () => {
      mounted = false;
    };
  }, [effectiveFarmerId]);

  // 선택한 todo 가 있으면 작업/필지 prefill (한 번).
  useEffect(() => {
    if (!selectedTodo) return;
    if (selectedTodo.job_cd && !workCd) setWorkCd(selectedTodo.job_cd);
    if (selectedTodo.parcel_no && parcels.length > 0 && !selectedParcel) {
      const match = parcels.find((p) => String(p.parcel_no) === String(selectedTodo.parcel_no));
      if (match) setSelectedParcel(match);
    }
  }, [selectedTodo?.todo_id, parcels.length]);

  const selectedJob = useMemo(
    () => jobOptions.find((j) => j.job_cd === workCd) || null,
    [jobOptions, workCd],
  );
  const cropLabel = selectedParcel ? parcelToCropLabel(selectedParcel) : "";
  const canSave = !!workCd && !!selectedParcel && !saving;

  async function handleSave() {
    if (!canSave || !selectedParcel || !selectedJob) return;
    setSaving(true);
    setErrorMessage("");
    const input: ManualDiaryInput = {
      workDate,
      work: selectedJob.job_name || selectedJob.job_cd,
      field: parcelToFieldLabel(selectedParcel),
      cropName: cropLabel,
      workDetail: memo,
      // 사진 첨부 시 evidence_id 를 linkedEvidenceText 로 전달 — saveManualDiaryRecord 가
      // 자동으로 파싱해 linked_evidence_ids 에 저장 (during_photo_evidence_id 도 함께).
      linkedEvidenceText: attachedEvidence?.evidence_id || "",
      farmer_id: effectiveFarmerId,
      todo_id: selectedTodo?.todo_id,
      group_no: selectedTodo?.group_no,
      prj_id: selectedTodo?.prj_id,
      project_id: selectedTodo?.project_id,
      activity_id: selectedTodo?.activity_id,
      job_cd: selectedTodo?.job_cd || selectedJob.job_cd,
      parcel_no: String(selectedParcel.parcel_no),
      field_id: selectedTodo?.field_id,
    };
    const result = await saveManualDiaryRecord(input);
    if (result.status === "failed") {
      const missing = result.validation.missing_fields.join(", ");
      setErrorMessage(missing ? `${result.message} ${missing}` : result.message);
      setSaving(false);
      return;
    }
    await onDiarySaved(input, result.record);
    setCompletedRecord(result.record);
    setSaving(false);
  }

  return (
    <div className="flex flex-col" style={{ background: "#ffffff", minHeight: "100vh", paddingBottom: "calc(env(safe-area-inset-bottom) + 200px)" }}>
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4 sticky top-0 z-10" style={{ background: "#ffffff", borderBottom: "1px solid var(--line-soft)" }}>
        <button
          onClick={() => navigate("home")}
          className="p-2 rounded-xl"
          style={{ background: "var(--bg-soft)", border: "1px solid var(--line-soft)" }}
        >
          <ChevronLeft className="w-6 h-6" style={{ color: "var(--ink)" }} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">직접 입력하기</h1>
          <p className="text-xs font-bold text-muted-foreground">오늘 한 일을 적어주세요</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-5">
        {/* 선택한 todo 안내 */}
        {selectedTodo && (
          <div
            className="jt-mobile-card rounded-2xl p-4"
            style={{ borderLeft: "4px solid var(--primary)" }}
          >
            <p className="text-xs font-bold mb-1" style={{ color: "var(--primary)" }}>
              선택한 할 일 기준으로 기록합니다
            </p>
            <p className="text-base font-bold" style={{ color: "var(--ink)" }}>
              {selectedTodo.job_name || selectedTodo.activity_name || selectedTodo.todo_title}
            </p>
          </div>
        )}

        {/* 카드 1: 기본 정보 (날짜 + 필지 + 작물 한 줄에) */}
        <div className="jt-mobile-card rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 flex-shrink-0" style={{ color: "var(--primary)" }} />
            <span className="text-base font-bold flex-1" style={{ color: "var(--ink)" }}>
              {formatKoreanDate(workDate)}
            </span>
          </div>
          {selectedParcel && (
            <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <MapPin className="w-5 h-5 flex-shrink-0" style={{ color: "var(--primary)" }} />
              <span className="text-base font-bold flex-1" style={{ color: "var(--ink)" }}>
                {parcelToFieldLabel(selectedParcel)}
              </span>
              <Wheat className="w-4 h-4" style={{ color: "var(--muted)" }} />
              <span className="text-sm font-bold" style={{ color: "var(--muted)" }}>{cropLabel}</span>
            </div>
          )}
        </div>

        {/* 카드 2: 필지 변경 (필지 2개 이상일 때만) */}
        {parcels.length > 1 && (
          <div className="jt-mobile-card rounded-2xl p-4">
            <p className="text-sm font-bold mb-3" style={{ color: "var(--ink-soft)" }}>위치 선택</p>
            <div className="flex flex-wrap gap-2">
              {parcels.map((p) => {
                const active = selectedParcel?.parcel_no === p.parcel_no;
                return (
                  <button
                    key={p.parcel_no}
                    onClick={() => setSelectedParcel(p)}
                    className="px-4 py-2.5 rounded-full text-sm font-bold transition-colors"
                    style={
                      active
                        ? { background: "var(--primary)", color: "#ffffff" }
                        : { background: "var(--bg-soft)", color: "var(--ink-soft)", border: "1px solid var(--line-soft)" }
                    }
                  >
                    {parcelToFieldLabel(p)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 카드 3: 작업 종류 — 단계/성격별 카테고리로 그룹화. 20+ 개 chip 평면 나열 시
            고령 사용자 찾기 어려운 문제 해결. 카테고리별 sub-heading + 그 아래 chip. */}
        <div className="jt-mobile-card rounded-2xl p-4">
          <p className="text-sm font-bold mb-3" style={{ color: "var(--ink-soft)" }}>
            작업 종류 {jobOptions.length === 0 && <span style={{ color: "var(--muted)" }}>(불러오는 중...)</span>}
          </p>
          <div className="flex flex-col gap-4">
            {groupJobsByCategory(jobOptions).map(({ category, label, jobs }) => (
              <div key={category}>
                <p
                  className="text-xs font-bold mb-2"
                  style={{ color: "var(--muted-2, #8a8e7e)", letterSpacing: "0.02em" }}
                >
                  {label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {jobs.map((opt) => {
                    const active = workCd === opt.job_cd;
                    return (
                      <button
                        key={opt.job_cd}
                        onClick={() => setWorkCd(opt.job_cd)}
                        className="px-4 py-2.5 rounded-full text-sm font-bold transition-colors"
                        style={
                          active
                            ? { background: "var(--primary)", color: "#ffffff" }
                            : { background: "var(--bg-soft)", color: "var(--ink-soft)", border: "1px solid var(--line-soft)" }
                        }
                      >
                        {opt.job_name || opt.job_cd}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 카드 4: 메모 */}
        <div className="jt-mobile-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardEdit className="w-5 h-5" style={{ color: "var(--primary)" }} />
            <p className="text-sm font-bold" style={{ color: "var(--ink-soft)" }}>세부 작업내용 (선택)</p>
          </div>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예: 중간 물떼기 시작, 약 3시간 작업"
            className="w-full rounded-xl px-4 py-3 text-base font-bold resize-none focus:outline-none focus:ring-2"
            style={{
              background: "var(--bg-soft)",
              border: "1px solid var(--line-soft)",
              color: "var(--ink)",
            }}
            rows={4}
          />
        </div>

        {/* 카드 5: 사진 첨부 (선택) — 친근한 카메라 UI (PhotoLiveCoachOverlay) 진입.
            셔터 → 즉시 evidence 업로드 → record state 저장 → diary 저장 시 자동 연결. */}
        <div className="jt-mobile-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Camera className="w-5 h-5" style={{ color: "var(--primary)" }} />
            <p className="text-sm font-bold" style={{ color: "var(--ink-soft)" }}>사진 첨부 (선택)</p>
          </div>
          {!attachedEvidence && !photoUploading && (
            <button
              type="button"
              onClick={() => {
                setPhotoError("");
                setShowCoach(true);
              }}
              className="w-full rounded-xl flex flex-col items-center justify-center gap-2 active:opacity-90"
              style={{
                background: "var(--bg-soft)",
                border: "2px dashed var(--primary)",
                color: "var(--primary)",
                padding: "22px 16px",
              }}
            >
              <Camera className="w-8 h-8" />
              <span className="text-base font-bold">사진 추가하기</span>
              <span className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>
                카메라가 자동으로 열려요
              </span>
            </button>
          )}
          {photoUploading && (
            <div
              className="w-full rounded-xl flex flex-col items-center justify-center gap-2"
              style={{
                background: "var(--bg-soft)",
                border: "1px solid var(--line-soft)",
                padding: "22px 16px",
              }}
            >
              <div
                className="w-7 h-7 rounded-full animate-spin"
                style={{
                  border: "3px solid var(--accent-soft)",
                  borderTopColor: "var(--primary)",
                }}
              />
              <span className="text-sm font-bold" style={{ color: "var(--ink-soft)" }}>
                사진 올리는 중...
              </span>
            </div>
          )}
          {attachedEvidence && !photoUploading && (
            <div className="flex items-center gap-3">
              {attachedEvidence.image_url && (
                <img
                  src={attachedEvidence.image_url}
                  alt="첨부한 사진"
                  className="rounded-xl object-cover flex-shrink-0"
                  style={{ width: 72, height: 72 }}
                />
              )}
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                  사진이 첨부됐어요
                </p>
                <p
                  className="text-xs font-bold leading-snug"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {attachedEvidence.address || "기록과 함께 저장돼요"}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setPhotoError("");
                    setShowCoach(true);
                  }}
                  className="rounded-lg px-3 py-1.5 flex items-center gap-1 active:opacity-80"
                  style={{
                    background: "var(--bg-soft)",
                    border: "1px solid var(--line)",
                    color: "var(--ink)",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <RefreshCcw className="w-3.5 h-3.5" />
                  다시
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAttachedEvidence(null);
                    setPhotoError("");
                  }}
                  className="rounded-lg px-3 py-1.5 flex items-center gap-1 active:opacity-80"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--line)",
                    color: "var(--ink-soft)",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <X className="w-3.5 h-3.5" />
                  삭제
                </button>
              </div>
            </div>
          )}
          {photoError && (
            <p className="text-xs font-bold mt-2" style={{ color: "var(--danger)" }}>
              {photoError}
            </p>
          )}
        </div>

        {errorMessage && (
          <p
            className="text-sm font-bold px-2"
            style={{ color: "var(--danger)" }}
          >
            {errorMessage}
          </p>
        )}
      </div>

      {/* Sticky CTA — 하단 고정 저장 버튼. safe-area-inset-bottom 적용 — 폰 home indicator 위에 안전 */}
      <div
        className="fixed bottom-0 left-0 right-0 px-4 z-40"
        style={{
          background: "#ffffff",
          borderTop: "1px solid var(--line-soft)",
          boxShadow: "0 -4px 16px rgba(31, 42, 31, 0.08)",
          paddingTop: 16,
          paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
        }}
      >
        <button
          onClick={() => void handleSave()}
          disabled={!canSave}
          className="w-full text-lg font-bold py-4 rounded-2xl active:opacity-90 disabled:opacity-40 transition-opacity"
          style={{
            background: "var(--primary)",
            color: "#ffffff",
            boxShadow: canSave
              ? "0 6px 16px rgba(47, 109, 79, 0.30), 0 2px 4px rgba(47, 109, 79, 0.20)"
              : "none",
          }}
        >
          {saving ? "저장 중..." : "기록 저장하기"}
        </button>
      </div>

      <CompletionModal
        open={!!completedRecord}
        title="기록을 완료했습니다"
        detailLines={
          completedRecord
            ? [
                { label: "날짜", value: completedRecord.work_date },
                { label: "작업", value: selectedJob?.job_name || completedRecord.work_stage || "-" },
                { label: "위치", value: selectedParcel ? parcelToFieldLabel(selectedParcel) : "-" },
                { label: "내용", value: completedRecord.work_detail || "-" },
              ]
            : []
        }
        onHome={() => navigate("home")}
      />

      {/* 친근한 카메라 UI — 사진 첨부 누르면 mount. 셔터 → 즉시 evidence 업로드. */}
      {showCoach && (
        <PhotoLiveCoachOverlay
          evidenceType={selectedTodo?.required_evidence_types?.[0]}
          jobCd={selectedTodo?.job_cd || workCd || undefined}
          onCapture={async (file) => {
            setShowCoach(false);
            setPhotoError("");
            setPhotoUploading(true);
            const result = await uploadEvidenceFile({
              file,
              farmer_id: effectiveFarmerId,
              project_id: selectedTodo?.project_id || SAMPLE_PROJECT_CONTEXT.project_id,
              prj_id: selectedTodo?.prj_id || SAMPLE_PROJECT_CONTEXT.prj_id,
              activity_id: selectedTodo?.activity_id || "",
              job_cd: selectedTodo?.job_cd || workCd || "",
              field_id: selectedTodo?.field_id || "",
              parcel_no:
                selectedTodo?.parcel_no
                || (selectedParcel ? String(selectedParcel.parcel_no) : "")
                || (parcels[0] ? String(parcels[0].parcel_no) : ""),
              todo_id: selectedTodo?.todo_id || "",
              activity_type:
                selectedJob?.job_name || selectedTodo?.activity_name || "직접 입력 첨부 사진",
              evidence_type: "",
              user_message: "직접 입력 화면에서 첨부",
              status: "needs_review",
            });
            setPhotoUploading(false);
            if (result.status === "failed") {
              setPhotoError(result.message);
              return;
            }
            setAttachedEvidence(result.record);
          }}
          onCancel={() => setShowCoach(false)}
        />
      )}
    </div>
  );
}
