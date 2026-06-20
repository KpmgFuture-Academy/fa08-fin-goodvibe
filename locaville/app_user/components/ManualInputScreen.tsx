"use client";

/**
 * ManualInputScreen — 직접 입력(위치·작업 선택 + 메모 + 사진 첨부).
 * 저장은 확인 모달 후 사용자 확정.
 *
 * 연결: 저장 = diary-service.saveManualDiaryRecord, 사진 첨부 시 evidence-service.uploadEvidenceFile
 *      → evidence_id 를 linkedEvidenceText 로 넘겨 일지에 연결.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Calendar, ClipboardPen, Camera, Loader, ChevronDown, Mic, MicOff } from "lucide-react";
import type { TodoItemApi } from "@/lib/todo-service";
import type { ParcelRef } from "./HomeScreen";
import CompletionModal from "./CompletionModal";
import { saveManualDiaryRecord } from "@/lib/diary-service";
import type { ManualDiaryInput } from "@/lib/diary-types";
import { uploadEvidenceFile } from "@/lib/evidence-service";
import { expectedReceiptHint, isJobInSeason, isJobYearRound, isParcelOptionalJob, pickBestJobBySimilarity, type FarmJobOption } from "@/lib/farm-job-service";
import { requestOpenAiStt } from "@/lib/ai-service";
import { SAMPLE_PROJECT_CONTEXT, SAMPLE_USER_CONTEXT } from "@/lib/sample-user-context";

// ── 음성 녹음 헬퍼 (브라우저 MediaRecorder) ──
function canUseMicRecording() {
  if (typeof window === "undefined") return false;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  if (typeof MediaRecorder === "undefined") return false;
  return true;
}
function pickRecorderMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  for (const m of candidates) {
    try {
      if ((MediaRecorder as unknown as { isTypeSupported?: (t: string) => boolean }).isTypeSupported?.(m)) return m;
    } catch { /* ignore */ }
  }
  return "audio/webm";
}

// ── STT 텍스트에서 필지 추론 ──
// 1) 정확한 라벨 일치 ("1번 논 (벼)") → 2) 머리 어절 일치 ("1번 논") → 3) 종류만 일치 (논/밭) 이면 같은 종류가 1개일 때만.
function inferParcelFromText(text: string, parcels: ParcelRef[]): ParcelRef | undefined {
  const norm = (s: string) => s.replace(/\s+/g, "").replace(/[()]/g, "");
  const q = norm(text);
  if (!q) return undefined;

  // 1) 라벨 통째
  for (const p of parcels) {
    if (p.label && q.includes(norm(p.label))) return p;
  }
  // 2) 머리 어절 — "1번 논 (벼)" → "1번 논"
  for (const p of parcels) {
    const head = norm((p.label || "").split("(")[0]);
    if (head && q.includes(head)) return p;
  }
  // 3) 종류(논/밭) 만 — 동일 종류 필지가 정확히 1개면 그 필지를 자동 선택
  for (const kind of ["밭", "논"]) {
    if (!q.includes(kind)) continue;
    const sameKind = parcels.filter((p) => p.kind === kind);
    if (sameKind.length === 1) return sameKind[0];
  }
  return undefined;
}

export interface JobGroup { category: string; label: string; jobs: FarmJobOption[]; }

interface ManualInputScreenProps {
  selectedTodo: TodoItemApi | null;
  parcels: ParcelRef[];
  jobGroups: JobGroup[];
  todayLabel: string;   // "6월 4일 목요일"
  todayYmd: string;     // "2026-06-04"
  /** 저장 귀속 대상 farmer_id (도우미 모드면 recipient). */
  farmerId?: string;
  navigate: (screen: string) => void;
  onManualSaved: (payload: { parcelNo: string; jobCd: string; memo: string; photoAttached: boolean }) => void;
}

export default function ManualInputScreen({ selectedTodo, parcels, jobGroups, todayLabel, todayYmd, farmerId, navigate, onManualSaved }: ManualInputScreenProps) {
  // 진입 시 미선택이 기본. to-do 로 진입한 경우에만 그 필지를 prefill (콜드 진입은 undefined).
  const [parcel, setParcel] = useState<ParcelRef | undefined>(
    parcels.find((p) => p.parcel_no === selectedTodo?.parcel_no),
  );
  const [jobCd, setJobCd] = useState(selectedTodo?.job_cd ?? "");
  const [memo, setMemo] = useState("");
  const [done, setDone] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showAll, setShowAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 음성 입력 (STT) ──
  const [recording, setRecording] = useState(false);
  const [sttProcessing, setSttProcessing] = useState(false);
  const [sttMessage, setSttMessage] = useState("");
  // 저장 시 학습 데이터로 보낼 STT 메타.
  const [voiceText, setVoiceText] = useState("");
  const [voicePredictedJobCd, setVoicePredictedJobCd] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const micSupported = canUseMicRecording();
  // 직접 선택 패널 펼침 — 기본 닫힘. 마이크 미지원 기기는 자동으로 펼쳐 바로 직접 선택 가능.
  const [showManual, setShowManual] = useState(!micSupported);

  useEffect(() => {
    return () => {
      // 화면을 벗어날 때 녹음 흔적 정리.
      try { recorderRef.current?.stop(); } catch { /* ignore */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const allJobs = jobGroups.flatMap((g) => g.jobs);
  const selectedJob = allJobs.find((j) => j.job_cd === jobCd);
  const photoAttached = !!photoFile;
  // 필지는 선택 사항 — 교육·자재구입·마을 공동활동처럼 필지와 무관한 작업도 있다.
  const canSave = !!jobCd && !saving;
  const effectiveFarmer = farmerId || SAMPLE_USER_CONTEXT.farmer_id;
  // 음성인식 종료(voiceText) 또는 작업 선택/ to-do prefill 시 하단 "선택 결과" 노출.
  const showSummary = !!voiceText || !!jobCd;

  // 제철 우선: 오늘 윈도우에 드는 작업 + 상시 작업 + (to-do 로 들어온) 선택 작업을 기본 노출하고,
  // 철 지난 작업은 "다른 작업도 보기"로 접어둔다. 윈도우 데이터가 없으면 모두 상시로 취급돼
  // 전부 노출 → 기존 동작과 동일(안전 폴백). pinnedJobCd 는 선택 chip 이 시기와 무관하게 보이도록.
  const todayMmdd = todayYmd.length >= 10 ? todayYmd.slice(5, 7) + todayYmd.slice(8, 10) : "";
  const pinnedJobCd = selectedTodo?.job_cd ?? "";
  const { seasonalGroups, otherGroups } = useMemo(() => {
    const inSeasonal = (j: FarmJobOption) =>
      isJobYearRound(j) || isJobInSeason(j, todayMmdd) || j.job_cd === pinnedJobCd;
    const pick = (keep: (j: FarmJobOption) => boolean) =>
      jobGroups.map((g) => ({ ...g, jobs: g.jobs.filter(keep) })).filter((g) => g.jobs.length > 0);
    const seasonal = pick(inSeasonal);
    // 제철 그룹이 비는 이례적 경우엔 전체를 기본 노출.
    return seasonal.length
      ? { seasonalGroups: seasonal, otherGroups: pick((j) => !inSeasonal(j)) }
      : { seasonalGroups: jobGroups, otherGroups: [] as JobGroup[] };
  }, [jobGroups, todayMmdd, pinnedJobCd]);

  const chip = (active: boolean) =>
    `rounded-full px-4 py-2.5 text-[14px] font-bold ${active ? "bg-[var(--lv-primary)] text-white" : "border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] text-[color:var(--lv-ink-soft)]"}`;
  const card = "rounded-2xl border border-[var(--lv-line-soft)] bg-white p-4 shadow-[0_1px_2px_rgba(31,42,31,0.04),0_6px_14px_rgba(31,42,31,0.04)]";
  const renderGroups = (groups: JobGroup[]) =>
    groups.map((g) => (
      <div key={g.category}>
        <p className="mb-2 text-[12px] font-bold tracking-wide text-[color:var(--lv-muted-2)]">{g.label}</p>
        <div className="flex flex-wrap gap-2">
          {g.jobs.map((o) => <button key={o.job_cd} onClick={() => setJobCd(o.job_cd)} className={chip(jobCd === o.job_cd)}>{o.job_name}</button>)}
        </div>
      </div>
    ));

  async function startRecording() {
    if (!micSupported || recording || sttProcessing) return;
    setSttMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickRecorderMime();
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const mimeUsed = rec.mimeType || mime;
        const ext = mimeUsed.includes("mp4") ? "mp4" : mimeUsed.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeUsed });
        chunksRef.current = [];
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (blob.size < 1500) {
          setSttMessage("녹음이 너무 짧아요. 다시 한 번 말씀해 주세요.");
          setSttProcessing(false);
          return;
        }
        const file = new File([blob], `manual_${Date.now()}.${ext}`, { type: mimeUsed });
        await handleSttResult(file);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      setSttMessage("마이크 권한이 필요해요. 브라우저 설정을 확인해 주세요.");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function stopRecording() {
    if (!recording) return;
    setRecording(false);
    setSttProcessing(true);
    try {
      recorderRef.current?.stop();
    } catch {
      setSttProcessing(false);
    }
  }

  async function handleSttResult(file: File) {
    const stt = await requestOpenAiStt(file);
    setSttProcessing(false);
    if (!stt || !stt.text) {
      setSttMessage(stt?.error_message || "음성을 인식하지 못했어요. 다시 한 번 시도해 주세요.");
      return;
    }
    const text = stt.text.trim();
    setVoiceText((prev) => (prev ? `${prev}\n${text}` : text));
    setMemo((prev) => (prev ? `${prev}\n${text}` : text));
    setSttMessage("");

    // 작업 자동 추천 — 유사도 매칭. 사용자가 손대지 않았을 때만 자동 적용 (선택 보존).
    const best = pickBestJobBySimilarity(text, allJobs);
    if (best) {
      setVoicePredictedJobCd(best.job_cd);
      if (!jobCd) setJobCd(best.job_cd);
    }
    // 필지 자동 매칭 — 추천 작업이 필지-무관(영농폐기물·교육·자재구입·마을활동) 이면 명시적으로 비우고,
    // 그 외엔 텍스트에서 라벨/머리어절/종류(논·밭) 순으로 매칭.
    if (best && isParcelOptionalJob(best.job_cd)) {
      setParcel(undefined);
    } else {
      const matched = inferParcelFromText(text, parcels);
      if (matched) setParcel(matched);
    }
  }

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoFile(f);
    setPhotoUrl(URL.createObjectURL(f));
  }
  function removePhoto() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoFile(null);
    setPhotoUrl(null);
  }

  async function handleSave() {
    if (!canSave || !selectedJob) return;
    setSaving(true);
    setErrorMessage("");

    // 사진이 있으면 먼저 evidence 업로드 → evidence_id 를 일지에 연결.
    let evidenceId = "";
    if (photoFile) {
      try {
        const up = await uploadEvidenceFile({
          file: photoFile,
          farmer_id: effectiveFarmer,
          project_id: selectedTodo?.project_id || SAMPLE_PROJECT_CONTEXT.project_id,
          prj_id: selectedTodo?.prj_id || SAMPLE_PROJECT_CONTEXT.prj_id,
          activity_id: selectedTodo?.activity_id || "",
          job_cd: selectedTodo?.job_cd || selectedJob.job_cd,
          field_id: selectedTodo?.field_id || "",
          parcel_no: parcel?.parcel_no || "",
          todo_id: selectedTodo?.todo_id || "manual_photo_001",
          activity_type: selectedTodo?.activity_name || selectedJob.job_name || "작업 증빙",
          evidence_type: selectedTodo?.required_evidence_types?.[0] || "",
          user_message: `'${selectedJob.job_name}' 직접 입력 첨부 사진`,
          status: "needs_review",
        });
        if (up.status === "success") evidenceId = up.record.evidence_id;
      } catch {
        // 사진 업로드 실패해도 일지 저장은 진행(사진 없이). 사용자에 안내만.
        setErrorMessage("사진은 보내지 못했지만 기록은 저장할게요.");
      }
    }

    const input: ManualDiaryInput = {
      workDate: todayYmd,
      work: selectedJob.job_name || selectedJob.job_cd,
      field: parcel?.label || "",
      cropName: parcel?.kind || "",
      workDetail: memo,
      linkedEvidenceText: evidenceId,
      farmer_id: effectiveFarmer,
      todo_id: selectedTodo?.todo_id,
      group_no: selectedTodo?.group_no,
      prj_id: selectedTodo?.prj_id,
      project_id: selectedTodo?.project_id,
      activity_id: selectedTodo?.activity_id,
      job_cd: selectedTodo?.job_cd || selectedJob.job_cd,
      parcel_no: parcel?.parcel_no || "",
      field_id: selectedTodo?.field_id,
      input_type: voiceText ? "voice" : "manual",
      voice_text: voiceText,
      voice_predicted_job_cd: voicePredictedJobCd,
    };

    try {
      const result = await saveManualDiaryRecord(input);
      if (result.status === "failed") {
        const missing = result.validation.missing_fields.join(", ");
        setErrorMessage(missing ? `${result.message} (${missing})` : result.message);
        setSaving(false);
        return;
      }
      setSaving(false);
      setDone(true);
    } catch {
      setErrorMessage("기록을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
      setSaving(false);
    }
  }

  return (
    <div className="relative flex h-full flex-col bg-white">
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickPhoto} />
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--lv-line-soft)] bg-white px-4 pb-4 pt-5">
        <button onClick={() => navigate("home")} className="rounded-xl border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] p-2"><ChevronLeft size={24} className="text-[color:var(--lv-ink)]" /></button>
        <div><h1 className="text-[19px] font-extrabold text-[color:var(--lv-ink)]">직접 입력하기</h1><p className="text-[12px] font-bold text-[color:var(--lv-muted)]">오늘 한 일을 말씀해 주세요</p></div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
        {/* 중앙 마이크 히어로 — 접힘이면 화면 중앙, 펼침이면 상단 정렬 */}
        <div className={`flex flex-col items-center gap-4 ${showManual ? "py-8" : "flex-1 justify-center"}`}>
          <div className="flex items-center gap-2 text-[15px] font-bold text-[color:var(--lv-muted)]"><Calendar size={18} className="text-[color:var(--lv-primary)]" />{todayLabel}</div>
          {micSupported ? (
            <button type="button" onClick={recording ? stopRecording : startRecording} disabled={sttProcessing} aria-label={recording ? "녹음 멈추기" : "녹음 시작"}
              className={`lv-orb-core relative text-white ${recording ? "bg-[color:var(--lv-warn)] lv-orb-pulse" : "bg-[color:var(--lv-primary)]"} ${sttProcessing ? "opacity-60" : ""}`}>
              {sttProcessing ? <Loader size={36} className="animate-spin" /> : recording ? <MicOff size={40} /> : <Mic size={40} />}
              {recording && (<><span className="lv-orb-ring lv-orb-ring-2" aria-hidden /><span className="lv-orb-ring" aria-hidden /></>)}
            </button>
          ) : (
            <div className="flex h-[104px] w-[104px] items-center justify-center rounded-full bg-[var(--lv-bg-soft)] text-[color:var(--lv-muted-2)]"><MicOff size={40} /></div>
          )}
          <p className="min-h-[24px] text-center text-[16px] font-bold text-[color:var(--lv-ink-soft)] [word-break:keep-all]">
            {!micSupported ? "이 기기는 음성 입력을 지원하지 않아요. 아래에서 직접 선택해 주세요." : recording ? "듣고 있어요…" : sttProcessing ? "받아 적고 있어요" : sttMessage ? sttMessage : "버튼을 누르고 오늘 한 일을 말해 보세요"}
          </p>
          <button type="button" onClick={() => setShowManual((v) => !v)} aria-expanded={showManual}
            className={`flex min-h-[56px] items-center justify-center gap-1.5 rounded-2xl border px-5 text-[16px] font-bold ${showManual ? "border-[var(--lv-primary)] bg-[var(--lv-accent-soft)] text-[color:var(--lv-primary)]" : "border-[var(--lv-line)] bg-white text-[color:var(--lv-ink-soft)]"}`}>
            직접 선택하기
            <ChevronDown size={18} className={`transition-transform ${showManual ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* 수동 입력 패널 — "직접 선택하기" 토글로 펼침 */}
        {showManual && (
        <div className="flex flex-col gap-4 pt-2">
        {/* 위치 — 선택 사항. 같은 칩 다시 누르면 해제, "필지 없음" 으로도 명시적으로 비울 수 있음 */}
        <div className={card}>
          <p className="mb-1 text-[14px] font-bold text-[color:var(--lv-ink-soft)]">위치 선택 (선택)</p>
          <p className="mb-3 text-[13px] font-bold text-[color:var(--lv-muted)] [word-break:keep-all]">교육·자재 구입처럼 필지와 무관한 작업은 비워두셔도 돼요.</p>
          <div className="flex flex-wrap gap-2">
            {parcels.map((p) => (
              <button
                key={p.parcel_no}
                onClick={() => setParcel(parcel?.parcel_no === p.parcel_no ? undefined : p)}
                className={chip(parcel?.parcel_no === p.parcel_no)}
              >
                {p.label}
              </button>
            ))}
            <button onClick={() => setParcel(undefined)} className={chip(!parcel)}>필지 없음</button>
          </div>
        </div>

        {/* 작업 종류 — 이맘때 작업 우선, 철 지난 작업은 "다른 작업도 보기"로 접어둠 */}
        <div className={card}>
          <div className="mb-3">
            <p className="text-[14px] font-bold text-[color:var(--lv-ink-soft)]">작업 종류</p>
            {otherGroups.length > 0 && (
              <p className="mt-1 text-[13px] font-bold text-[color:var(--lv-primary)] [word-break:keep-all]">이맘때 하는 작업이에요. 다른 작업은 아래에서 찾을 수 있어요.</p>
            )}
          </div>
          <div className="flex flex-col gap-4">
            {renderGroups(seasonalGroups)}
          </div>

          {otherGroups.length > 0 && (
            <>
              <button type="button" onClick={() => setShowAll((v) => !v)}
                className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] text-[15px] font-bold text-[color:var(--lv-ink-soft)]">
                {showAll ? "접기" : "다른 작업도 보기"}
                <ChevronDown size={18} className={`transition-transform ${showAll ? "rotate-180" : ""}`} />
              </button>
              {showAll && (
                <div className="mt-4 flex flex-col gap-4 border-t border-[var(--lv-line-soft)] pt-4">
                  {renderGroups(otherGroups)}
                </div>
              )}
            </>
          )}
        </div>

        {/* 메모 */}
        <div className={card}>
          <div className="mb-3 flex items-center gap-2"><ClipboardPen size={20} className="text-[color:var(--lv-primary)]" /><p className="text-[14px] font-bold text-[color:var(--lv-ink-soft)]">세부 작업내용 (선택)</p></div>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={4} placeholder="예: 중간 물떼기 시작, 약 3시간 작업"
            className="w-full resize-none rounded-xl border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] px-4 py-3 text-[16px] font-semibold text-[color:var(--lv-ink)] outline-none" />
        </div>
        </div>
        )}

        {/* 사진 등록하기 — 하단 영역 (항상 표시) */}
        <div className={`${card} mt-4`}>
          <div className="mb-3 flex items-center gap-2"><Camera size={20} className="text-[color:var(--lv-primary)]" /><p className="text-[14px] font-bold text-[color:var(--lv-ink-soft)]">사진 등록하기 (선택)</p></div>
          {/* 작업이 영수증 기반 작업이면 어떤 영수증인지 미리 안내 — 잘못된 영수증 첨부 예방 */}
          {expectedReceiptHint(jobCd) && (
            <p className="mb-3 rounded-xl bg-[var(--lv-bg-soft)] px-3.5 py-2.5 text-[13px] font-bold text-[color:var(--lv-ink-soft)] [word-break:keep-all]">
              💡 이 작업은 <span className="text-[color:var(--lv-primary)]">{expectedReceiptHint(jobCd)}</span> 사진을 기대해요. 다른 영수증을 올리면 이장님 확인 표시가 떠요.
            </p>
          )}
          {!photoAttached ? (
            <button onClick={() => fileInputRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--lv-primary)] bg-[var(--lv-bg-soft)] px-4 py-[22px] text-[color:var(--lv-primary)]">
              <Camera size={32} /><span className="text-[16px] font-bold">사진 추가하기</span>
              <span className="text-[12px] font-bold text-[color:var(--lv-ink-soft)]">카메라가 자동으로 열려요</span>
            </button>
          ) : (
            <div className="flex items-center gap-3">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="첨부한 사진" className="h-[72px] w-[72px] shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="h-[72px] w-[72px] shrink-0 rounded-xl bg-[repeating-linear-gradient(135deg,#eef1ea,#eef1ea_8px,#e4e8df_8px,#e4e8df_16px)]" />
              )}
              <div className="min-w-0 flex-1"><p className="text-[14px] font-bold text-[color:var(--lv-ink)]">사진이 첨부됐어요</p><p className="text-[12px] font-bold text-[color:var(--lv-ink-soft)]">기록과 함께 저장돼요</p></div>
              <button onClick={removePhoto} className="rounded-lg border border-[var(--lv-line)] px-2.5 py-1.5 text-[12px] font-bold text-[color:var(--lv-ink-soft)]">삭제</button>
            </div>
          )}
        </div>

        {errorMessage && (
          <p className="mt-4 rounded-xl bg-[var(--lv-warn-soft)] px-3.5 py-2.5 text-[14px] font-bold text-[color:var(--lv-warn)] [word-break:keep-all]">{errorMessage}</p>
        )}
      </div>

      {/* 하단 고정 — 음성인식이 끝나면 "선택 결과" + "기록 저장하기" */}
      <div className="border-t border-[var(--lv-line-soft)] bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 shadow-[0_-4px_16px_rgba(31,42,31,0.08)]">
        {showSummary && (
          <div className="mb-3 rounded-2xl border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] px-4 py-3">
            <p className="mb-2 text-[12px] font-bold tracking-wide text-[color:var(--lv-muted-2)]">선택 결과</p>
            <div className="flex flex-col gap-1 text-[15px]">
              <div className="flex gap-2"><span className="w-[44px] shrink-0 font-bold text-[color:var(--lv-muted)]">작업</span><span className="font-extrabold text-[color:var(--lv-ink)]">{selectedJob?.job_name ?? "미선택"}</span></div>
              <div className="flex gap-2"><span className="w-[44px] shrink-0 font-bold text-[color:var(--lv-muted)]">위치</span><span className="font-bold text-[color:var(--lv-ink-soft)]">{parcel?.label ?? "필지 없음"}</span></div>
              {memo && <div className="flex gap-2"><span className="w-[44px] shrink-0 font-bold text-[color:var(--lv-muted)]">내용</span><span className="font-bold text-[color:var(--lv-ink-soft)] [word-break:keep-all] line-clamp-2">{memo}</span></div>}
            </div>
          </div>
        )}
        <button onClick={handleSave} disabled={!canSave}
          className={`flex min-h-[72px] w-full items-center justify-center gap-2 rounded-2xl text-[17px] font-extrabold text-white ${canSave ? "bg-[var(--lv-primary)] shadow-[0_6px_16px_rgba(47,109,79,0.3)]" : "bg-[var(--lv-primary)] opacity-40"}`}>
          {saving ? <><Loader size={20} className="animate-spin" />저장 중…</> : "기록 저장하기"}
        </button>
      </div>

      <CompletionModal open={done} title="이장님께 보냈어요"
        detailLines={[
          { label: "날짜", value: todayYmd },
          { label: "작업", value: selectedJob?.job_name ?? "-" },
          { label: "위치", value: parcel?.label ?? "-" },
          { label: "내용", value: memo || "-" },
        ]}
        onHome={() => { onManualSaved({ parcelNo: parcel?.parcel_no ?? "", jobCd, memo, photoAttached }); navigate("home"); }} />
    </div>
  );
}

/* Claude Code: jobGroups = farm-job-service, parcels = parcel-service.
   저장은 diary-service.saveManualDiaryRecord + 사진 첨부 시 evidence-service.uploadEvidenceFile. */
