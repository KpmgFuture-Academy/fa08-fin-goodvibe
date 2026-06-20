"use client";

/**
 * PhotoInputScreen — 증빙 사진/문서 등록.
 * phase: coach(라이브 카메라 코칭) → preview(촬영 확인 + 필지) → uploading → done.
 *
 * 연결:
 *  - coach: PhotoLiveCoachOverlay (getUserMedia 라이브 카메라 + 3초마다 Vision 코칭 + TTS).
 *           카메라 불가(LAN HTTP 등) 시 갤러리 파일 선택으로 폴백.
 *  - 업로드: evidence-service.uploadEvidenceFile. onPhotoSaved 에서 재촬영 해소/재조회.
 *  - 증빙 종류(사진/영수증/이수증)는 selectedTodo.required_evidence_types 로 판별해 문구 분기.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, RefreshCcw, MapPin, Loader, Images, AlertTriangle } from "lucide-react";
import type { TodoItemApi } from "@/lib/todo-service";
import type { ParcelRef, RetakeRequest } from "./HomeScreen";
import CompletionModal from "./CompletionModal";
import { PhotoLiveCoachOverlay } from "./PhotoLiveCoachOverlay";
import { uploadEvidenceFile } from "@/lib/evidence-service";
import type { EvidenceRecord } from "@/lib/evidence-types";
import { SAMPLE_PROJECT_CONTEXT, SAMPLE_USER_CONTEXT } from "@/lib/sample-user-context";
import { useGeolocation } from "@/lib/geolocation-service";
import { getDataSource } from "@/lib/data-source";
import { getEvidenceKind, getEvidenceActionLabel } from "@/lib/display-labels";

interface PhotoInputScreenProps {
  selectedTodo: TodoItemApi | null;
  retake?: RetakeRequest | null;
  parcels: ParcelRef[];
  /** 업로드 귀속 대상 farmer_id (도우미 모드면 recipient). */
  farmerId?: string;
  navigate: (screen: string) => void;
  /** 업로드 성공 시. */
  onPhotoSaved: (parcelNo: string) => void;
}

export default function PhotoInputScreen({ selectedTodo, retake, parcels, farmerId, navigate, onPhotoSaved }: PhotoInputScreenProps) {
  const [phase, setPhase] = useState<"coach" | "preview" | "uploading" | "done">("coach");
  const [parcel, setParcel] = useState<ParcelRef | undefined>(
    parcels.find((p) => p.parcel_no === (selectedTodo?.parcel_no ?? retake?.parcel_no)) ?? parcels[0],
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  // 업로드 응답 record — 촬영 후 To-do 일치 판정(todo_match/needs_chief_verification)을 담아 결과화면 분기.
  const [verdict, setVerdict] = useState<EvidenceRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const gps = useGeolocation({ enabled: phase === "coach" || phase === "preview" });
  const kind = getEvidenceKind(selectedTodo?.required_evidence_types);
  const kindLabel = getEvidenceActionLabel(kind);
  const evidenceType = selectedTodo?.required_evidence_types?.[0];
  const taskName = selectedTodo?.job_name ?? retake?.job_name ?? null;
  const needParcel = !selectedTodo?.parcel_no && kind === "photo"; // 영수증/이수증은 필지 무관
  const effectiveFarmer = farmerId || SAMPLE_USER_CONTEXT.farmer_id;

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function acceptFile(f: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setErrorMessage("");
    setPhase("preview");
  }
  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  }

  async function upload() {
    if (!file) { setErrorMessage("먼저 사진을 찍어 주세요."); setPhase("coach"); return; }
    if (getDataSource() !== "api") { setErrorMessage("사진 업로드는 API 모드에서만 동작해요."); return; }
    setPhase("uploading");
    setErrorMessage("");
    const coords = gps.status === "ok" ? { lat: gps.lat, lng: gps.lng } : null;
    const parcelNo = selectedTodo?.parcel_no || parcel?.parcel_no || parcels[0]?.parcel_no || "";
    try {
      const result = await uploadEvidenceFile({
        file,
        farmer_id: effectiveFarmer,
        project_id: selectedTodo?.project_id || SAMPLE_PROJECT_CONTEXT.project_id,
        prj_id: selectedTodo?.prj_id || SAMPLE_PROJECT_CONTEXT.prj_id,
        activity_id: selectedTodo?.activity_id || "",
        job_cd: selectedTodo?.job_cd || "",
        field_id: selectedTodo?.field_id || "",
        parcel_no: parcelNo,
        todo_id: selectedTodo?.todo_id || (retake ? `retake_${retake.evidence_id}` : "todo_photo_001"),
        activity_type: selectedTodo?.activity_name || selectedTodo?.job_name || retake?.job_name || "작업 증빙",
        evidence_type: evidenceType || "",
        user_message: selectedTodo
          ? `'${selectedTodo.job_name || selectedTodo.activity_name || "작업"}' ${kindLabel.short} 증빙`
          : retake ? "재촬영 요청 사진" : "사진만 등록 — AI 자동 분류, 이장님 검토 대기",
        status: "needs_review",
        gps_lat: coords?.lat,
        gps_long: coords?.lng,
      });
      if (result.status === "failed") {
        setErrorMessage(result.message || "보내지 못했어요. 잠시 후 다시 시도해주세요.");
        setPhase("preview");
        return;
      }
      setVerdict(result.record ?? null);
      setPhase("done");
    } catch {
      setErrorMessage("보내지 못했어요. 인터넷 연결을 확인해주세요.");
      setPhase("preview");
    }
  }

  const goHome = () => { onPhotoSaved(parcel?.parcel_no ?? ""); navigate("home"); };
  const retakePhoto = () => {
    setVerdict(null);
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setErrorMessage("");
    setPhase("coach");
  };
  // 촬영 후 판정 → 결과화면 3단계. todo_match 없거나 "O"/"" 면 통과(관대 기본).
  const matchState: "match" | "uncertain" | "mismatch" =
    verdict?.todo_match === "X"
      ? "mismatch"
      : verdict?.todo_match === "UNCERTAIN" || verdict?.needs_chief_verification
        ? "uncertain"
        : "match";

  // 갤러리/파일 선택 폴백 — 카메라 불가 또는 영수증/이수증 기존 파일 선택.
  const fallbackInput = (
    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
  );

  // 라이브 카메라 코칭
  if (phase === "coach") {
    return (
      <>
        {fallbackInput}
        <PhotoLiveCoachOverlay
          evidenceType={evidenceType}
          jobCd={selectedTodo?.job_cd}
          title={taskName ? `${taskName} · ${kindLabel.short}` : kindLabel.short}
          onCapture={acceptFile}
          onCancel={() => navigate("home")}
          onFallback={() => fileInputRef.current?.click()}
        />
      </>
    );
  }

  // 촬영 확인 + 필지
  return (
    <div className="relative flex min-h-full flex-col bg-white pb-[120px]">
      {fallbackInput}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--lv-line-soft)] bg-white px-4 pb-4 pt-5">
        <button onClick={() => navigate("home")} className="rounded-xl border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] p-2"><ChevronLeft size={24} className="text-[color:var(--lv-ink)]" /></button>
        <div>
          <h1 className="text-[20px] font-extrabold text-[color:var(--lv-ink)]">{kind === "photo" ? "찍은 사진 확인" : `${kindLabel.short} 확인`}</h1>
          <p className="text-[14px] font-semibold text-[color:var(--lv-muted)]">잘 나왔으면 아래에서 완료해주세요</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 py-5">
        <div className="rounded-2xl border border-[var(--lv-line-soft)] bg-white p-3 shadow-[0_1px_2px_rgba(31,42,31,0.04),0_6px_14px_rgba(31,42,31,0.04)]">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="촬영한 사진" className="aspect-[4/3] w-full rounded-xl object-cover" />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-[repeating-linear-gradient(135deg,#eef1ea,#eef1ea_14px,#e4e8df_14px,#e4e8df_28px)]">
              <span className="font-mono text-[13px] font-bold text-[color:var(--lv-muted)]">촬영한 사진</span>
            </div>
          )}
        </div>

        {needParcel && parcels.length > 1 && (
          <div>
            <p className="mb-3 pl-0.5 text-[17px] font-extrabold text-[color:var(--lv-ink)]">어느 필지인가요?</p>
            <div className="grid grid-cols-2 gap-3">
              {parcels.map((p) => {
                const active = parcel?.parcel_no === p.parcel_no;
                return (
                  <button key={p.parcel_no} onClick={() => setParcel(p)}
                    className={`flex flex-col items-center gap-2 rounded-2xl px-3 py-[18px] ${active ? "bg-[var(--lv-primary)] text-white shadow-[0_8px_20px_rgba(47,109,79,0.3)]" : "border border-[var(--lv-line)] bg-white text-[color:var(--lv-ink)] shadow-[0_2px_8px_rgba(31,42,31,0.05)]"}`}>
                    <span className={`rounded-full p-2.5 ${active ? "bg-white/20" : "bg-[var(--lv-accent-soft)]"}`}><MapPin size={26} className={active ? "text-white" : "text-[color:var(--lv-primary)]"} /></span>
                    <span className="text-[19px] font-extrabold leading-tight [word-break:keep-all]">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {errorMessage && (
          <div className="rounded-xl bg-[var(--lv-danger-soft)] px-4 py-3" role="alert">
            <p className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[color:var(--lv-danger)]">
              <AlertTriangle size={15} className="shrink-0" /> 업로드 실패
            </p>
            <p className="mt-1 text-[16px] font-medium leading-[1.5] text-[color:var(--lv-ink)] [word-break:keep-all]">{errorMessage}</p>
            <p className="mt-1 text-[14px] font-medium leading-[1.5] text-[color:var(--lv-ink-soft)] [word-break:keep-all]">아래 ‘이대로 완료’를 다시 누르면 재시도할 수 있어요.</p>
          </div>
        )}
        <p className="pl-1 text-[13px] font-bold leading-snug text-[color:var(--lv-muted)]">· 위치 정보는 필지 확인에만 사용돼요<br />· 사진은 작업 확인을 위해서만 쓰여요</p>
      </div>

      {/* 하단 고정 CTA */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2.5 border-t border-[var(--lv-line-soft)] bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3.5 shadow-[0_-4px_16px_rgba(31,42,31,0.08)]">
        <div className="flex gap-3">
          <button onClick={() => setPhase("coach")} className="flex min-h-[64px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border border-[var(--lv-line)] bg-white px-2 text-[18px] font-bold text-[color:var(--lv-ink)]"><RefreshCcw size={20} />다시 찍기</button>
          <button onClick={() => fileInputRef.current?.click()} className="flex min-h-[64px] items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border border-[var(--lv-line)] bg-white px-3 text-[16px] font-bold text-[color:var(--lv-ink-soft)]"><Images size={20} />갤러리</button>
          <button onClick={upload} className="flex min-h-[64px] flex-[1.4] items-center justify-center whitespace-nowrap rounded-2xl bg-[var(--lv-primary)] px-2 text-[19px] font-bold text-white">이대로 완료</button>
        </div>
      </div>

      {phase === "uploading" && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/40">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-8 py-7">
            <Loader size={40} className="animate-spin text-[color:var(--lv-primary)]" />
            <p className="text-[16px] font-bold text-[color:var(--lv-ink)]">{kindLabel.short}을(를) 보내고 있어요…</p>
          </div>
        </div>
      )}

      {/* 결과화면 3단계: ✅ 맞음 / ⚠️ 애매·확신낮음(이장님 확인) / ❌ 불일치(다시 찍기 권유) */}
      <CompletionModal open={phase === "done" && matchState === "match"} title="이장님께 보냈어요"
        highlightLines={[`“${taskName ?? "오늘 작업"}” ${kindLabel.short}을(를) 보냈어요`, "오늘 할 일에서 완료로 바뀌었어요"]}
        detailLines={[
          { label: "기록한 일", value: taskName ?? `${kindLabel.short} 증빙` },
          { label: "위치", value: parcel ? parcel.label : "-" },
          { label: "확인", value: "이장님이 확인해요" },
        ]}
        onHome={goHome} />

      <CompletionModal open={phase === "done" && matchState === "uncertain"} tone="warn" title="사진을 보냈어요"
        highlightLines={["이장님이 한 번 더 확인하실 거예요", verdict?.todo_match_reason || "작업과 맞는지 확실하지 않아요"]}
        detailLines={[
          { label: "기록한 일", value: taskName ?? `${kindLabel.short} 증빙` },
          { label: "위치", value: parcel ? parcel.label : "-" },
          { label: "확인", value: "이장님이 꼭 확인해요" },
        ]}
        onHome={goHome} />

      <CompletionModal open={phase === "done" && matchState === "mismatch"} tone="warn" title="다른 작업 사진 같아요"
        highlightLines={[verdict?.todo_match_reason || "이 작업과 다른 사진일 수 있어요", "다시 찍거나, 이대로 보내도 돼요"]}
        secondary={{ label: "다시 찍기", onClick: retakePhoto }}
        homeLabel="이대로 보내기"
        onHome={goHome} />
    </div>
  );
}
