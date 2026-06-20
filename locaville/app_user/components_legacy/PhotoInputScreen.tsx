"use client";

/**
 * 사진 증빙 화면 ("사진만 등록하기").
 *
 * 새 흐름 — 농가는 "사진만 찍는다":
 *   1) 화면 진입 → 카메라 자동 열림
 *   2) 사진 촬영 → 큰 미리보기
 *   3) [이 사진으로 등록] 누르면 즉시 업로드 (작업 분류는 AI 가 자동)
 *   4) 이장님이 화면에서 검토·확정
 *
 * 더 이상 농가가 "어떤 증빙인가요?" 를 고르지 않음 — AI 자동 분류 + 이장님 검증.
 * GPS 는 자동 첨부 (사진 워터마크/위치 확인용).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Camera, Loader2, RefreshCcw, MapPin } from "lucide-react";
import { getDataSource } from "@/lib/data-source";
import { getClassificationLabel, getEvidenceTypeLabel } from "@/lib/display-labels";
import { uploadEvidenceFile } from "@/lib/evidence-service";
import { fetchFarmerParcels, type FarmerParcel } from "@/lib/parcel-service";
import { SAMPLE_PROJECT_CONTEXT } from "@/lib/sample-user-context";
import { useHelperMode } from "@/lib/helper-mode-context";
import type { EvidenceRecord } from "@/lib/evidence-types";
import type { TodoItemApi } from "@/lib/todo-service";
import CompletionModal from "./CompletionModal";
import { PhotoLiveCoachOverlay } from "./PhotoLiveCoachOverlay";
import { pickTodoEvidenceKind } from "./TodoIllustration";

/** parcel.usage 코드 → 농가 친화 라벨 + 이모지 아이콘 */
function parcelTypeInfo(p: FarmerParcel): { label: string; crop: string; kind: string } {
  const usage = (p.usage || "").toUpperCase();
  if (usage === "RPA") return { label: "논", crop: "벼", kind: "논" };
  if (usage === "DFA") return { label: "밭", crop: "고추", kind: "밭" };
  if (usage === "FFA") return { label: "과수원", crop: "과수", kind: "과수원" };
  return { label: "필지", crop: "기타", kind: "필지" };
}

type Screen =
  | "home" | "voiceInput" | "manualInput" | "photoInput" | "saveComplete"
  | "journal" | "business" | "help" | "settings"
  | "journalDetail" | "businessDetail" | "splash" | "loginSelect" | "manualLogin";

interface SavedRecord {
  date: string;
  work: string;
  field: string;
  amount: string;
  business: string;
  hasPhoto: boolean;
  memo?: string;
  linkedEvidenceIds?: string[];
  inputMethod: "voice" | "manual" | "photo";
}

interface PhotoInputScreenProps {
  navigate: (screen: Screen) => void;
  setSavedRecord: (r: SavedRecord) => void;
  setInputMethod: (m: "voice" | "manual" | "photo") => void;
  setUploadedPhoto: (p: boolean) => void;
  onEvidenceUploaded: (record: EvidenceRecord) => void;
  recentUploadedEvidence: EvidenceRecord | null;
  selectedTodo?: TodoItemApi | null;
}

export default function PhotoInputScreen({
  navigate,
  setSavedRecord,
  setInputMethod,
  setUploadedPhoto,
  onEvidenceUploaded,
  selectedTodo,
}: PhotoInputScreenProps) {
  const { effectiveFarmerId } = useHelperMode();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadedRecord, setUploadedRecord] = useState<EvidenceRecord | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; long: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "locating" | "ready" | "denied" | "unsupported">("idle");
  // PhotoLiveCoachOverlay 진입 시 자동 노출 — 라이브 카메라 + 3초마다 Vision 코칭 + TTS.
  // onCapture(file) 받으면 PhotoInputScreen 의 기존 업로드 흐름으로 연결.
  // GPS 는 별도 useEffect 가 사전 확보 (gpsCoords). parcels 1개면 자동 선택.
  const [showGuard, setShowGuard] = useState(true);

  // 필지 — DB 에서 가져옴. 1개면 자동 선택, 2개 이상이면 큰 카드 grid 로 선택.
  const [parcels, setParcels] = useState<FarmerParcel[]>([]);
  const [selectedParcel, setSelectedParcel] = useState<FarmerParcel | null>(null);

  useEffect(() => {
    let mounted = true;
    void fetchFarmerParcels(effectiveFarmerId).then((rows) => {
      if (!mounted) return;
      setParcels(rows);
      if (rows.length === 1) setSelectedParcel(rows[0]);
    });
    return () => {
      mounted = false;
    };
  }, [effectiveFarmerId]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dataSource = getDataSource();

  // evidence_type 분기 — 영수증/이수증은 필지(parcel) 와 무관하므로 필지 선택 grid 숨김.
  // PIC (작업 사진) / PIC_SEQ (2장) 만 필지가 의미 있음.
  const evidenceKind = pickTodoEvidenceKind(selectedTodo?.required_evidence_types);
  const requiresParcel = evidenceKind === "photo" || evidenceKind === "photo_seq";

  // PhotoGuardOverlay 가 카메라 호출을 대신함 — 진입 시 자동 카메라 click 은 제거.
  // (사용자가 Guard 를 닫고 fallback 으로 직접 사진을 고르려고 fileInputRef 를 누르면 그때만 카메라).

  // GPS 사전 확보 (업로드 시 함께 전송)
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsStatus("unsupported");
      return;
    }
    let mounted = true;
    setGpsStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mounted) return;
        setGpsCoords({ lat: pos.coords.latitude, long: pos.coords.longitude });
        setGpsStatus("ready");
      },
      () => {
        if (!mounted) return;
        setGpsStatus("denied");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
    return () => {
      mounted = false;
    };
  }, []);

  const previewUrl = useMemo(() => {
    if (!selectedFile) return "";
    return URL.createObjectURL(selectedFile);
  }, [selectedFile]);

  // 업로드 직후 AI 자동 분류 결과를 완료 모달 큰 문구로
  const classificationPhrases = useMemo<string[]>(() => {
    if (!uploadedRecord) return [];
    const r = uploadedRecord;
    const workLabel =
      r.activity_type && r.activity_type !== "작업 증빙"
        ? r.activity_type
        : getEvidenceTypeLabel(r.evidence_type);
    if ((r.classification || "").toLowerCase() === "receipt") {
      const vendor = r.receipt_ocr?.vendor?.trim();
      const amount = r.receipt_ocr?.amount;
      return [
        "영수증으로 보여요",
        vendor ? `구입처: ${vendor}` : `"${workLabel}" 증빙`,
        ...(amount != null ? [`금액: ${Number(amount).toLocaleString("ko-KR")}원`] : []),
      ];
    }
    return [getClassificationLabel(r.classification), `"${workLabel}" 작업 같아요`];
  }, [uploadedRecord]);

  const completionDetailLines = useMemo(() => {
    if (!uploadedRecord) return [];
    const r = uploadedRecord;
    const lines: { label: string; value: string }[] = [
      { label: "AI 자동 분류", value: getEvidenceTypeLabel(r.evidence_type) || "확인 중" },
    ];
    if (r.address) lines.push({ label: "위치", value: r.address });
    else if (r.gps_lat) lines.push({ label: "위치", value: `${r.gps_lat?.toFixed(5)}, ${r.gps_long?.toFixed(5)}` });
    // "확인" row 는 모달 sub-title 에 표시됨 — 중복 제거.
    return lines;
  }, [uploadedRecord]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setUploadedRecord(null);
    setErrorMessage("");
  }

  // handleUpload — file/parcel/gps 를 인자로 받아 state 의존 안 함.
  // PhotoGuardOverlay onConfirm 에서 즉시 호출 가능 (state 비동기 race 회피).
  async function handleUpload(opts?: {
    file?: File | null;
    parcel?: FarmerParcel | null;
    gps?: { lat: number; long: number } | null;
  }) {
    if (uploading) return;
    if (dataSource !== "api") {
      setErrorMessage("사진 업로드는 API 모드에서 사용할 수 있습니다.");
      return;
    }
    const file = opts?.file ?? selectedFile;
    const parcel = opts?.parcel ?? selectedParcel;
    const gps = opts?.gps ?? gpsCoords;
    if (!file) {
      setErrorMessage("먼저 사진을 찍어 주세요.");
      return;
    }

    setUploading(true);
    setErrorMessage("");

    // selectedTodo 가 있으면 그 todo 와 연결된 증빙으로 업로드 — todo 자동 완료 처리됨.
    // 없으면 AI 자동 분류 흐름.
    const result = await uploadEvidenceFile({
      file,
      farmer_id: effectiveFarmerId,
      project_id: selectedTodo?.project_id || SAMPLE_PROJECT_CONTEXT.project_id,
      prj_id: selectedTodo?.prj_id || SAMPLE_PROJECT_CONTEXT.prj_id,
      activity_id: selectedTodo?.activity_id || "",
      job_cd: selectedTodo?.job_cd || "",
      field_id: selectedTodo?.field_id || parcel?.parcel_regno || "",
      // parcel_no — 영수증/이수증 케이스라도 prj_journal.parcel_no NOT NULL 충족 위해
      // parcels[0] 자동 fallback. 의미적으로는 영수증과 무관하지만 시연 안전.
      parcel_no:
        selectedTodo?.parcel_no
        || (parcel ? String(parcel.parcel_no) : "")
        || (parcels[0] ? String(parcels[0].parcel_no) : ""),
      todo_id: selectedTodo?.todo_id || "todo_photo_001",
      activity_type: selectedTodo?.activity_name || selectedTodo?.job_name || "작업 증빙",
      evidence_type: "",
      user_message: selectedTodo
        ? `'${selectedTodo.job_name || selectedTodo.activity_name || "작업"}' 사진 증빙`
        : "사진만 등록 — AI 자동 분류, 이장님 검토 대기",
      status: "needs_review",
      gps_lat: gps?.lat,
      gps_long: gps?.long,
    });

    setUploading(false);

    if (result.status === "failed") {
      setErrorMessage(result.message);
      return;
    }

    setUploadedPhoto(true);
    setInputMethod("photo");
    setUploadedRecord(result.record);
    onEvidenceUploaded(result.record);
    setSavedRecord({
      date: new Date(result.record.captured_at).toLocaleDateString("ko-KR"),
      work: result.record.activity_type || "사진 증빙",
      field: "",
      amount: "-",
      business: "저탄소 농업 프로그램",
      hasPhoto: true,
      memo: result.record.user_message,
      linkedEvidenceIds: [result.record.evidence_id],
      inputMethod: "photo",
    });
  }

  const gpsHint =
    gpsStatus === "ready"
      ? "위치 정보가 함께 기록됩니다"
      : gpsStatus === "locating"
      ? "위치를 확인하고 있어요..."
      : gpsStatus === "denied"
      ? "위치 권한 없음 — 위치 없이 저장됩니다"
      : gpsStatus === "unsupported"
      ? "이 기기에서는 위치를 가져올 수 없어요"
      : "";

  return (
    <div className="flex flex-col pb-32" style={{ background: "#ffffff", minHeight: "100vh" }}>
      {/* 헤더 */}
      <div
        className="flex items-center gap-3 px-4 pt-5 pb-4 sticky top-0 z-10"
        style={{ background: "#ffffff", borderBottom: "1px solid var(--line-soft)" }}
      >
        <button
          onClick={() => navigate("home")}
          className="p-2 rounded-xl"
          style={{ background: "var(--bg-soft)", border: "1px solid var(--line-soft)" }}
        >
          <ChevronLeft className="w-6 h-6" style={{ color: "var(--ink)" }} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">사진 등록</h1>
          <p className="text-xs font-bold text-muted-foreground">사진만 찍어주시면 나머지는 자동이에요</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-5">
        {!selectedFile ? (
          // 아직 사진 전: 점선 큰 카드
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-2xl py-16 flex flex-col items-center gap-3 active:opacity-90"
            style={{
              background: "var(--bg-soft)",
              border: "2px dashed var(--primary)",
            }}
          >
            <div
              className="rounded-full p-5"
              style={{ background: "var(--accent-soft)" }}
            >
              <Camera className="w-12 h-12" style={{ color: "var(--primary)" }} />
            </div>
            <p className="text-lg font-bold" style={{ color: "var(--ink)" }}>사진 찍기</p>
            <p className="text-xs font-bold" style={{ color: "var(--muted)" }}>카메라가 자동으로 열려요</p>
          </button>
        ) : (
          <>
            {/* 사진 미리보기 — 큰 카드 */}
            <div className="jt-mobile-card rounded-2xl p-3">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="촬영한 사진"
                  className="w-full rounded-xl object-cover"
                  style={{ aspectRatio: "4/3" }}
                />
              )}
            </div>

            {/* 필지 선택 — 가독성 큰 카드 grid. 1개면 자동 선택, 2개 이상이면 표시.
                영수증/이수증은 필지와 무관 (농자재 가게/교육 장소) — requiresParcel 분기로 숨김. */}
            {requiresParcel && parcels.length > 1 && (
              <div>
                <p className="text-lg font-extrabold mb-3 px-1" style={{ color: "var(--ink)" }}>
                  어느 필지인가요?
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {parcels.map((p) => {
                    const info = parcelTypeInfo(p);
                    const active = selectedParcel?.parcel_no === p.parcel_no;
                    return (
                      <button
                        key={p.parcel_no}
                        onClick={() => setSelectedParcel(p)}
                        className="rounded-2xl py-5 px-3 flex flex-col items-center gap-2 transition-all active:opacity-90"
                        style={
                          active
                            ? {
                                background: "var(--primary)",
                                color: "#ffffff",
                                boxShadow: "0 8px 20px rgba(47, 109, 79, 0.32), 0 3px 6px rgba(47, 109, 79, 0.20)",
                              }
                            : {
                                background: "#ffffff",
                                border: "1px solid var(--line)",
                                color: "var(--ink)",
                                boxShadow: "0 2px 8px rgba(31, 42, 31, 0.05)",
                              }
                        }
                      >
                        <div
                          className="rounded-full p-3"
                          style={{
                            background: active ? "rgba(255, 255, 255, 0.18)" : "var(--accent-soft)",
                          }}
                        >
                          <MapPin
                            className="w-7 h-7"
                            style={{ color: active ? "#ffffff" : "var(--primary)" }}
                          />
                        </div>
                        <p className="text-xl font-extrabold leading-tight">
                          {p.parcel_no}번 {info.kind}
                        </p>
                        <p
                          className="text-sm font-bold"
                          style={{ color: active ? "#ffffff" : "var(--ink)" }}
                        >
                          {info.crop}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* GPS 상태만 작게 표시 — 본문 영역 깔끔 유지 */}
            {gpsHint && (
              <p className="text-xs font-bold px-2" style={{ color: "var(--muted)" }}>
                · {gpsHint}
              </p>
            )}

            {errorMessage && (
              <p className="text-sm font-bold px-2" style={{ color: "var(--danger)" }}>
                {errorMessage}
              </p>
            )}
          </>
        )}
      </div>

      {/* Sticky CTA — 사진 찍은 후에만 표시 */}
      {selectedFile && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 py-4 z-40 flex gap-3"
          style={{
            background: "#ffffff",
            borderTop: "1px solid var(--line-soft)",
            boxShadow: "0 -4px 16px rgba(31, 42, 31, 0.08)",
          }}
        >
          <button
            onClick={() => {
              // 라이브 코칭 화면을 다시 띄움 — getUserMedia 카메라 + 3초 폴링.
              // 옛 흐름의 file input(갤러리) 호출은 더 이상 사용 X.
              setSelectedFile(null);
              setErrorMessage("");
              setShowGuard(true);
            }}
            disabled={uploading}
            className="flex-1 rounded-2xl py-4 text-base font-bold flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-40"
            style={{
              background: "#ffffff",
              border: "1px solid var(--line)",
              color: "var(--ink)",
            }}
          >
            <RefreshCcw className="w-5 h-5" />
            다시 찍기
          </button>
          <button
            onClick={() => void handleUpload()}
            disabled={uploading || (requiresParcel && parcels.length > 1 && !selectedParcel)}
            className="flex-1 rounded-2xl py-4 text-base font-bold active:opacity-90 active:translate-y-0.5 transition-transform disabled:opacity-40"
            style={{
              background: "var(--primary)",
              color: "#ffffff",
              boxShadow: "0 6px 16px rgba(47, 109, 79, 0.30), 0 2px 4px rgba(47, 109, 79, 0.20)",
            }}
          >
            {uploading
              ? "등록 중..."
              : requiresParcel && parcels.length > 1 && !selectedParcel
              ? "필지를 골라 주세요"
              : "이 사진으로 등록"}
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 업로드 중 로딩 오버레이 */}
      {uploading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="flex flex-col items-center gap-3 rounded-2xl px-8 py-6"
            style={{
              background: "#ffffff",
              boxShadow: "0 16px 32px rgba(31, 42, 31, 0.18)",
            }}
          >
            <Loader2 className="h-10 w-10 animate-spin" style={{ color: "var(--primary)" }} />
            <p className="text-base font-bold" style={{ color: "var(--ink)" }}>
              사진을 등록하고 있어요...
            </p>
          </div>
        </div>
      )}

      {/* 완료 팝업 */}
      <CompletionModal
        open={!!uploadedRecord}
        title="사진을 등록했어요"
        highlightLines={classificationPhrases}
        detailLines={completionDetailLines}
        onHome={() => navigate("home")}
      />

      {/* 라이브 카메라 코칭 오버레이 — 진입 시 자동.
          3초마다 video frame → 백엔드 Vision 코칭 → TTS 음성 안내.
          status=ok 면 셔터 초록 fill. 사용자가 셔터 누르면 onCapture(file).
          parcels 1개면 즉시 업로드, 2개 이상이면 미리보기 화면에서 필지 선택. */}
      {showGuard && (
        <PhotoLiveCoachOverlay
          evidenceType={selectedTodo?.required_evidence_types?.[0]}
          jobCd={selectedTodo?.job_cd}
          onCapture={(file) => {
            setSelectedFile(file);
            setShowGuard(false);
            // 영수증/이수증은 필지 선택 불필요 → parcels 수와 무관하게 즉시 업로드.
            // PIC 일 때만 parcels 2개 이상이면 사용자 선택 대기.
            if (!requiresParcel || parcels.length <= 1) {
              void handleUpload({ file, parcel: selectedParcel, gps: gpsCoords });
            }
          }}
          onCancel={() => {
            setShowGuard(false);
            navigate("home");
          }}
        />
      )}
    </div>
  );
}
