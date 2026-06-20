"use client";

/** 사업 상세 화면. 선택한 사업의 활동·작업 + 농가의 진행 상태 + 증빙자료함 + PDF 리포트 트리거. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, ChevronLeft, Circle, FileDown, FolderOpen } from "lucide-react";
import { getApiBaseUrl } from "@/lib/data-source";
import { describeActivityKorean, getEvidenceTypeLabel } from "@/lib/display-labels";
import { listEvidenceRecords } from "@/lib/evidence-service";
import { resolveProjectIdForApi } from "@/lib/project-id";
import { useHelperMode } from "@/lib/helper-mode-context";
import type { EvidenceRecord } from "@/lib/evidence-types";
import type { Business } from "./BusinessScreen";

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

// 농가용 화면 — 상태 분류/필터 없이 본인이 올린 증빙을 그대로 보여줌.
// 검토 완료 / 재촬영 요청 같은 판단은 이장님 화면에서 처리.

interface BusinessDetailScreenProps {
  business: Business | null;
  navigate: (screen: Screen) => void;
  onRequestPhotoUpload?: (business: Business) => void;
}

function formatDate(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function BusinessDetailScreen({ business, navigate, onRequestPhotoUpload }: BusinessDetailScreenProps) {
  const { effectiveFarmerId } = useHelperMode();
  const [toastMessage, setToastMessage] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showEvidenceSection, setShowEvidenceSection] = useState(false);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceRecord[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");

  const projectKeys = useMemo(() => {
    if (!business) return [];
    return resolveProjectIdForApi(business).keys;
  }, [business]);


  const loadEvidence = useCallback(async () => {
    if (!business) return;
    setLoadingEvidence(true);
    setEvidenceError("");
    try {
      const rows = await listEvidenceRecords({
        farmer_id: effectiveFarmerId,
        prj_id: resolveProjectIdForApi(business).prj_id,
        project_id: resolveProjectIdForApi(business).project_id,
      });
      const scoped = rows
        .filter((item) => {
          if (item.farmer_id !== effectiveFarmerId) return false;
          if (projectKeys.length === 0) return true;
          return projectKeys.includes(item.prj_id) || projectKeys.includes(item.project_id);
        })
        .sort((a, b) => {
          const left = b.created_at || b.captured_at || "";
          const right = a.created_at || a.captured_at || "";
          return left.localeCompare(right);
        });
      setEvidenceItems(scoped);
    } catch {
      setEvidenceItems([]);
      setEvidenceError("증빙자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoadingEvidence(false);
    }
  }, [business, projectKeys, effectiveFarmerId]);

  useEffect(() => {
    if (showEvidenceSection) {
      void loadEvidence();
    }
  }, [showEvidenceSection, loadEvidence]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  async function handlePDF() {
    if (!business || pdfLoading) return;
    setPdfLoading(true);
    setToastMessage("PDF를 생성하고 있습니다.");

    const resolved = resolveProjectIdForApi(business);
    const url = new URL("/reports/project-pdf", getApiBaseUrl());
    url.searchParams.set("farmer_id", effectiveFarmerId);
    url.searchParams.set("prj_id", resolved.prj_id);

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        setToastMessage("PDF 생성에 실패했습니다. 다시 시도해 주세요.");
        return;
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const contentDisposition = response.headers.get("content-disposition") || "";
      const matched = contentDisposition.match(/filename="?([^";]+)"?/i);
      anchor.href = objectUrl;
      anchor.download = matched?.[1] || `report_${effectiveFarmerId}_${resolved.prj_id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
      setToastMessage("PDF 저장을 시작했습니다.");
    } catch {
      setToastMessage("PDF 생성에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setPdfLoading(false);
    }
  }

  function handleGoPhotoInput() {
    if (!business) return;
    if (onRequestPhotoUpload) {
      onRequestPhotoUpload(business);
      return;
    }
    navigate("photoInput");
  }

  if (!business) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <p className="text-base text-muted-foreground">사업 정보를 불러올 수 없습니다.</p>
        <button onClick={() => navigate("business")} className="mt-4 text-primary font-bold">
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-8" style={{ background: "#ffffff", minHeight: "100vh" }}>
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background text-sm font-bold px-5 py-3 rounded-2xl shadow-xl text-center">
          {toastMessage}
        </div>
      )}

      <div className="flex items-center gap-3 px-4 pt-5">
        <button onClick={() => navigate("business")} className="p-2 rounded-xl bg-secondary active:bg-accent">
          <ChevronLeft className="w-6 h-6 text-primary" />
        </button>
        <h1 className="text-xl font-bold text-foreground flex-1">사업 상세</h1>
      </div>

      <div className="mx-4 jt-mobile-card rounded-2xl p-4">
        <h2 className="text-lg font-bold text-foreground">{business.name}</h2>
        {business.biz_name && (
          <p className="text-sm text-muted-foreground mt-1">{business.biz_name}</p>
        )}
        {business.exec_year && (
          <p className="text-xs text-muted-foreground mt-1">시행연도 {business.exec_year}</p>
        )}
      </div>

      {business.items.length > 0 && (
        <div className="mx-4 jt-mobile-card rounded-2xl p-4">
          <h3 className="text-base font-bold text-foreground mb-3">이 사업의 활동</h3>
          <div className="flex flex-col gap-2">
            {business.activities.map((a) => (
              <div key={a.activity_id} className="flex items-start gap-3 py-1">
                <Circle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-base text-foreground font-bold">{a.activity_name}</p>
                  {(a.start_date || a.end_date) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.start_date || ""} ~ {a.end_date || ""}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mx-4 jt-mobile-card rounded-2xl p-4">
        <h3 className="text-base font-bold text-muted-foreground mb-2">관련 영농일지 기록</h3>
        <p className="text-sm text-muted-foreground">최근 기록은 영농일지 탭에서 확인할 수 있습니다.</p>
        <button onClick={() => navigate("journal")} className="mt-3 text-sm font-bold text-primary underline underline-offset-2">
          영농일지 보러 가기
        </button>
      </div>

      <div className="mx-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={() => void handlePDF()}
            disabled={pdfLoading}
            className="bg-primary text-primary-foreground text-base font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:opacity-90 shadow-md disabled:opacity-60"
          >
            <FileDown className="w-5 h-5" />
            {pdfLoading ? "PDF 생성 중..." : "PDF로 저장"}
          </button>
          <button
            onClick={() => setShowEvidenceSection((prev) => !prev)}
            className="bg-card border border-primary/30 text-primary text-base font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:opacity-90"
          >
            <FolderOpen className="w-5 h-5" />
            증빙자료함
          </button>
        </div>
      </div>

      {showEvidenceSection && (
        <div className="mx-4 jt-mobile-card rounded-2xl p-4">
          <h3 className="text-base font-bold text-foreground">증빙자료함</h3>

          {loadingEvidence && <p className="mt-3 text-sm text-muted-foreground">증빙자료를 불러오는 중입니다.</p>}
          {!loadingEvidence && evidenceError && <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>{evidenceError}</p>}

          {!loadingEvidence && !evidenceError && evidenceItems.length > 0 && (
            <div className="mt-3 space-y-3">
              {evidenceItems.map((item) => (
                <div key={item.evidence_id} className="rounded-xl border border-border p-3 bg-muted/20">
                  {item.image_url ? (
                    <img src={item.image_url} alt={getEvidenceTypeLabel(item.evidence_type)} className="w-full h-44 object-cover rounded-lg border border-border mb-3" />
                  ) : (
                    <div className="w-full h-44 rounded-lg border border-dashed border-border mb-3 flex items-center justify-center text-sm text-muted-foreground bg-background">
                      이미지가 없습니다.
                    </div>
                  )}

                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      <span className="text-foreground font-bold">{describeActivityKorean(item.activity_id, item.activity_type)}</span>
                    </p>
                    <p>
                      등록일: <span className="text-foreground font-bold">{formatDate(item.created_at || item.captured_at)}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingEvidence && !evidenceError && evidenceItems.length === 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-border p-4 bg-muted/20">
              <p className="text-sm text-muted-foreground">이 사업에 등록된 증빙자료가 없습니다.</p>
              <button
                onClick={handleGoPhotoInput}
                className="mt-3 w-full sm:w-auto bg-primary text-primary-foreground text-sm font-bold px-4 py-2.5 rounded-xl inline-flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                사진 등록하기
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
