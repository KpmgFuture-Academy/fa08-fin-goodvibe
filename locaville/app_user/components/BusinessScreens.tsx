"use client";

/** BusinessScreen(참여 사업 목록) + BusinessDetailScreen(활동·진행률). */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, ChevronLeft, PenLine, Camera, Check, FileText, Images, Loader } from "lucide-react";
import { listEvidenceRecords } from "@/lib/evidence-service";
import type { EvidenceRecord } from "@/lib/evidence-types";
import { getEvidenceTypeLabel } from "@/lib/display-labels";
import { resolveProjectIdForApi } from "@/lib/project-id";
import { getApiBaseUrl } from "@/lib/data-source";
import { SAMPLE_USER_CONTEXT } from "@/lib/sample-user-context";

export interface BusinessActivity {
  activity_name: string;
  desc: string;
  evidence: string;   // "사진" / "영수증" / "이수증" / "영농일지" ...
  done?: number;
  target?: number;
}
export interface Business {
  prj_id: string;
  name: string;
  biz_name: string;
  exec_year: number;
  items: string[];
  activities: BusinessActivity[];
  /** 이 사업으로 생긴 미완료 할 일 수. */
  relatedTodoCount?: number;
}

// ── 목록 ──
export function BusinessScreen({ businesses, navigate, onOpen, easy }: {
  businesses: Business[];
  navigate: (screen: string) => void;
  onOpen: (b: Business) => void;
  /** 쉬운 모드 — 큰 글씨 + 할 일 연결 등 부가 정보를 숨기고 사업만 간단히 보여준다. */
  easy?: boolean;
}) {
  return (
    <div className="min-h-full bg-[var(--lv-bg)] pb-7">
      <div className="px-4 pb-2 pt-4">
        <h1 className={`font-extrabold tracking-tight text-[color:var(--lv-ink)] ${easy ? "text-[30px]" : "text-[28px]"}`}>참여 사업</h1>
        <p className={`mt-1 font-semibold text-[color:var(--lv-ink-soft)] [word-break:keep-all] ${easy ? "text-[16px]" : "text-[15px]"}`}>
          {easy ? "참여 중인 사업을 눌러 서류와 사진을 볼 수 있어요." : "이 사업 때문에 오늘 할 일이 만들어져요."}
        </p>
      </div>
      <div className="lv-stagger mx-4 mt-2 flex flex-col gap-3">
        {businesses.map((b) => (
          <button key={b.prj_id} onClick={() => onOpen(b)}
            className="w-full rounded-[18px] border border-[var(--lv-line-soft)] bg-[var(--lv-card)] p-4 text-left shadow-[0_1px_2px_rgba(31,42,31,0.04),0_6px_14px_rgba(31,42,31,0.04)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className={`flex-1 font-extrabold leading-tight text-[color:var(--lv-ink)] [word-break:keep-all] ${easy ? "text-[19px]" : "text-[17px]"}`}>{b.name}</span>
              <ChevronRight size={easy ? 22 : 20} className="text-[color:var(--lv-muted)]" />
            </div>
            <p className={`mb-2.5 text-[color:var(--lv-muted)] ${easy ? "text-[14px]" : "text-[13px]"}`}>{b.biz_name}</p>
            <div className={`flex flex-wrap gap-1.5 ${!easy && b.relatedTodoCount ? "mb-3" : ""}`}>
              {b.items.slice(0, 4).map((label) => (
                <span key={label} className={`rounded-full bg-[rgba(47,109,79,0.1)] font-bold text-[color:var(--lv-primary)] ${easy ? "px-3 py-1 text-[14px]" : "px-2.5 py-1 text-[13px]"}`}>{label}</span>
              ))}
            </div>
            {/* 할 일 연결은 부가 기능 — 쉬운 모드에선 숨겨 사업만 간단히 보여준다. */}
            {!easy && !!b.relatedTodoCount && (
              <div className="flex items-center gap-1.5 border-t border-[var(--lv-line-soft)] pt-3">
                <PenLine size={16} className="text-[color:var(--lv-primary)]" />
                <span className="whitespace-nowrap text-[14px] font-extrabold text-[color:var(--lv-ink)]">관련 할 일 {b.relatedTodoCount}개</span>
                <span className="ml-auto text-[14px] font-extrabold text-[color:var(--lv-primary)]">보기 ›</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 상세 ──
export function BusinessDetailScreen({ business, navigate, onRequestPhoto, onSeeTodos, farmerId, easy }: {
  business: Business | null;
  navigate: (screen: string) => void;
  onRequestPhoto: (b: Business) => void;
  onSeeTodos: () => void;
  /** PDF/증빙 조회 귀속 농가 (도우미 모드면 recipient). */
  farmerId?: string;
  /** 쉬운 모드 — 간략한 사업 설명 + PDF 저장 + 사진 보기만. 활동 목록/할 일/업로드는 숨김. */
  easy?: boolean;
}) {
  const [toast, setToast] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceRecord[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  const effectiveFarmer = farmerId || SAMPLE_USER_CONTEXT.farmer_id;
  const projectKeys = useMemo(() => (business ? resolveProjectIdForApi(business).keys : []), [business]);

  const loadEvidence = useCallback(async () => {
    if (!business) return;
    setLoadingEvidence(true);
    try {
      const resolved = resolveProjectIdForApi(business);
      const rows = await listEvidenceRecords({ farmer_id: effectiveFarmer, prj_id: resolved.prj_id, project_id: resolved.project_id });
      const scoped = rows
        .filter((it) => projectKeys.length === 0 || projectKeys.includes(it.prj_id) || projectKeys.includes(it.project_id))
        .filter((it) => !!it.image_url)
        .sort((a, b) => (b.created_at || b.captured_at || "").localeCompare(a.created_at || a.captured_at || ""));
      setEvidenceItems(scoped);
    } catch {
      setEvidenceItems([]);
    } finally {
      setLoadingEvidence(false);
    }
  }, [business, projectKeys, effectiveFarmer]);

  useEffect(() => { if (showEvidence) void loadEvidence(); }, [showEvidence, loadEvidence]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function handlePDF() {
    if (!business || pdfLoading) return;
    setPdfLoading(true);
    setToast("PDF를 만들고 있어요…");
    const resolved = resolveProjectIdForApi(business);
    try {
      const url = new URL("/reports/project-pdf", getApiBaseUrl());
      url.searchParams.set("farmer_id", effectiveFarmer);
      url.searchParams.set("prj_id", resolved.prj_id);
      const res = await fetch(url.toString());
      if (!res.ok) { setToast("PDF를 만들지 못했어요. 다시 시도해 주세요."); return; }
      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const cd = res.headers.get("content-disposition") || "";
      const matched = cd.match(/filename="?([^";]+)"?/i);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = matched?.[1] || `사업증빙_${resolved.prj_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(objectUrl);
      setToast("PDF 저장을 시작했어요.");
    } catch {
      setToast("PDF를 만들지 못했어요. 다시 시도해 주세요.");
    } finally {
      setPdfLoading(false);
    }
  }

  if (!business) return null;

  // ── 쉬운 모드: 간략한 사업 설명 + 서류(PDF) 저장 + 사진 보기만 ──
  if (easy) {
    return (
      <div className="relative flex min-h-full flex-col bg-[var(--lv-bg)]">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--lv-line-soft)] bg-[var(--lv-card)] px-4 pb-4 pt-5">
          <button onClick={() => navigate("business")} aria-label="뒤로" className="rounded-xl border border-[var(--lv-line)] bg-[var(--lv-bg-soft)] p-2.5"><ChevronLeft size={26} className="text-[color:var(--lv-ink)]" /></button>
          <h1 className="text-[22px] font-extrabold leading-tight text-[color:var(--lv-ink)] [word-break:keep-all]">{business.name}</h1>
        </div>

        <div className="flex flex-col gap-4 px-4 pb-10 pt-5">
          {/* 간략한 사업 설명 */}
          <div className="rounded-2xl border border-[var(--lv-accent-soft)] bg-[var(--lv-accent-soft)] p-4">
            <p className="text-[18px] font-extrabold text-[color:var(--lv-accent-dark)] [word-break:keep-all]">{business.biz_name}</p>
            <p className="mt-1 text-[16px] font-semibold text-[color:var(--lv-accent-dark)]">{business.exec_year}년도 사업</p>
            {business.items.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {business.items.map((label) => (
                  <span key={label} className="rounded-full bg-white/70 px-3 py-1 text-[14px] font-bold text-[color:var(--lv-accent-dark)]">{label}</span>
                ))}
              </div>
            )}
          </div>

          {/* 서류(PDF)로 저장 — 큰 버튼 */}
          <button onClick={() => void handlePDF()} disabled={pdfLoading}
            className="flex min-h-[72px] w-full items-center justify-center gap-2.5 rounded-[20px] bg-[var(--lv-primary)] text-[20px] font-extrabold text-white shadow-[0_8px_18px_rgba(47,109,79,0.26)] disabled:opacity-60">
            {pdfLoading ? <Loader size={24} className="animate-spin" /> : <FileText size={24} />}{pdfLoading ? "만드는 중…" : "서류(PDF)로 저장"}
          </button>

          {/* 사진 보기 — 큰 버튼 (눌러서 펼치기) */}
          <button onClick={() => setShowEvidence((v) => !v)}
            className={`flex min-h-[72px] w-full items-center justify-center gap-2.5 rounded-[20px] border-[1.5px] border-[var(--lv-primary)] text-[20px] font-extrabold text-[color:var(--lv-primary)] ${showEvidence ? "bg-[var(--lv-accent-soft)]" : "bg-[var(--lv-card)]"}`}>
            <Images size={24} />{showEvidence ? "사진 닫기" : "사진 보기"}
          </button>

          {showEvidence && (
            <div className="rounded-2xl border border-[var(--lv-line-soft)] bg-[var(--lv-card)] p-4">
              <p className="mb-3 text-[16px] font-extrabold text-[color:var(--lv-ink)]">올린 사진 {evidenceItems.length}장</p>
              {loadingEvidence ? (
                <p className="py-4 text-center text-[15px] font-bold text-[color:var(--lv-muted)]">불러오는 중…</p>
              ) : evidenceItems.length === 0 ? (
                <p className="py-4 text-center text-[15px] font-semibold text-[color:var(--lv-muted)] [word-break:keep-all]">아직 올린 사진이 없어요.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {evidenceItems.map((it) => (
                    <div key={it.evidence_id} className="overflow-hidden rounded-xl border border-[var(--lv-line-soft)] bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.image_url} alt={getEvidenceTypeLabel(it.evidence_type)} className="aspect-[4/3] w-full object-cover" />
                      <p className="px-3 py-2 text-[14px] font-bold text-[color:var(--lv-ink-soft)] [word-break:keep-all]">{getEvidenceTypeLabel(it.evidence_type)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-center text-[14px] font-semibold leading-snug text-[color:var(--lv-muted)] [word-break:keep-all]">서류는 그동안 올린 기록과 사진을 모아 만들어요.</p>
        </div>

        {toast && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--lv-ink)] px-5 py-3 text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(0,0,0,0.25)]">{toast}</div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-full flex-col bg-[var(--lv-bg)]">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--lv-line-soft)] bg-[var(--lv-card)] px-4 pb-4 pt-5">
        <button onClick={() => navigate("business")} className="rounded-xl border border-[var(--lv-line)] bg-[var(--lv-bg-soft)] p-2.5"><ChevronLeft size={24} className="text-[color:var(--lv-ink)]" /></button>
        <h1 className="text-[20px] font-extrabold leading-tight text-[color:var(--lv-ink)] [word-break:keep-all]">{business.name}</h1>
      </div>
      <div className="flex flex-col gap-4 px-4 pb-10 pt-5">
        <div className="rounded-2xl border border-[var(--lv-accent-soft)] bg-[var(--lv-accent-soft)] p-4">
          <p className="text-[15px] font-extrabold text-[color:var(--lv-accent-dark)]">{business.biz_name}</p>
          <p className="mt-1 text-[15px] font-semibold text-[color:var(--lv-accent-dark)]">{business.exec_year}년도 · 활동 {business.activities.length}개</p>
        </div>

        {/* 사업 → 할 일 연결 */}
        <button onClick={onSeeTodos} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--lv-line)] bg-[var(--lv-card)] p-4 text-left">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--lv-accent-soft)]"><PenLine size={22} className="text-[color:var(--lv-primary)]" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-extrabold leading-tight text-[color:var(--lv-ink)] [word-break:keep-all]">이 사업 때문에 오늘 할 일이 생겼어요</p>
            <p className="mt-px text-[14px] font-semibold text-[color:var(--lv-ink-soft)]">관련 할 일 보기</p>
          </div>
          <ChevronRight size={22} className="text-[color:var(--lv-ink-soft)]" />
        </button>

        <div className="flex flex-col gap-3">
          <p className="pl-0.5 text-[17px] font-extrabold text-[color:var(--lv-ink)]">활동 내용</p>
          {business.activities.map((a) => {
            const hasProgress = typeof a.done === "number" && typeof a.target === "number";
            const ok = hasProgress && (a.done as number) >= (a.target as number);
            const pct = hasProgress ? Math.min(100, Math.round(((a.done as number) / (a.target as number)) * 100)) : 0;
            return (
              <div key={a.activity_name} className="flex flex-col gap-2 rounded-2xl border border-[var(--lv-line-soft)] bg-[var(--lv-card)] p-4 shadow-[0_1px_2px_rgba(31,42,31,0.04),0_6px_14px_rgba(31,42,31,0.04)]">
                <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
                  <p className="min-w-0 flex-1 text-[18px] font-extrabold text-[color:var(--lv-ink)] [word-break:keep-all]">{a.activity_name}</p>
                  <span className="max-w-full shrink-0 rounded-full bg-[rgba(47,109,79,0.1)] px-2.5 py-1 text-[13px] font-extrabold text-[color:var(--lv-primary)] [word-break:keep-all]">{a.evidence}</span>
                </div>
                <p className="text-[16px] font-medium leading-snug text-[color:var(--lv-ink-soft)] [word-break:keep-all]">{a.desc}</p>
                {hasProgress && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--lv-line-soft)]">
                      <div className={`h-full rounded-full ${ok ? "bg-[var(--lv-primary)]" : "bg-[var(--lv-warn)]"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-extrabold ${ok ? "text-[color:var(--lv-primary)]" : "text-[color:var(--lv-warn)]"}`}>
                      {ok ? <><Check size={14} />완료</> : `${a.done}/${a.target} · ${(a.target as number) - (a.done as number)}회 남음`}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 증빙 출력 / 자료함 */}
        <div className="flex gap-2.5">
          <button onClick={() => void handlePDF()} disabled={pdfLoading}
            className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl border border-[var(--lv-line)] bg-white text-[16px] font-extrabold text-[color:var(--lv-ink)] disabled:opacity-60">
            {pdfLoading ? <Loader size={20} className="animate-spin" /> : <FileText size={20} className="text-[color:var(--lv-primary)]" />}{pdfLoading ? "만드는 중…" : "PDF로 저장"}
          </button>
          <button onClick={() => setShowEvidence((v) => !v)}
            className={`flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl border text-[16px] font-extrabold ${showEvidence ? "border-[var(--lv-primary)] bg-[var(--lv-accent-soft)] text-[color:var(--lv-primary)]" : "border-[var(--lv-line)] bg-white text-[color:var(--lv-ink)]"}`}>
            <Images size={20} className="text-[color:var(--lv-primary)]" />증빙자료함
          </button>
        </div>

        {showEvidence && (
          <div className="rounded-2xl border border-[var(--lv-line-soft)] bg-[var(--lv-card)] p-4">
            <p className="mb-3 text-[15px] font-extrabold text-[color:var(--lv-ink)]">올린 증빙자료 {evidenceItems.length}장</p>
            {loadingEvidence ? (
              <p className="py-3 text-center text-[14px] font-bold text-[color:var(--lv-muted)]">불러오는 중…</p>
            ) : evidenceItems.length === 0 ? (
              <p className="py-3 text-center text-[14px] font-semibold text-[color:var(--lv-muted)]">이 사업에 등록된 증빙자료가 아직 없어요.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {evidenceItems.map((it) => (
                  <div key={it.evidence_id} className="overflow-hidden rounded-xl border border-[var(--lv-line-soft)] bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.image_url} alt={getEvidenceTypeLabel(it.evidence_type)} className="aspect-[4/3] w-full object-cover" />
                    <p className="px-2.5 py-1.5 text-[12px] font-bold text-[color:var(--lv-ink-soft)] [word-break:keep-all]">{getEvidenceTypeLabel(it.evidence_type)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={() => onRequestPhoto(business)} className="flex min-h-[64px] w-full items-center justify-center gap-2.5 rounded-[18px] bg-[var(--lv-primary)] text-[20px] font-extrabold text-white shadow-[0_8px_18px_rgba(47,109,79,0.26)]">
          <Camera size={24} />사진 찍어 올리기
        </button>
        <p className="text-center text-[13px] font-semibold leading-snug text-[color:var(--lv-muted)]">사진은 작업 확인을 위해서만 쓰여요.</p>
      </div>

      {toast && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--lv-ink)] px-5 py-3 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(0,0,0,0.25)]">{toast}</div>
      )}
    </div>
  );
}

/* Claude Code: businesses = business-service. relatedTodoCount 는 prj_id ↔ todo
   매핑으로 산출. onSeeTodos = 표준이면 home, 쉬운이면 journal 로 navigate. */
