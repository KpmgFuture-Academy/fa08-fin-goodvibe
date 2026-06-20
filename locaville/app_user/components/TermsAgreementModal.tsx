"use client";

/**
 * TermsAgreementModal — 첫 진입 약관 동의 + 설정 재열람 공용 (nextjs_app 디자인).
 *  - mode "agree": 필수 2 + 선택 1 체크 → recordTermsAgreement. 시니어 친화 큰 체크·명확한 배지.
 *  - mode "review": 설정에서 약관 내용만 읽기.
 */

import { useState } from "react";
import { ShieldCheck, Check, ChevronDown, X, MapPin } from "lucide-react";
import {
  TERMS_KEYS,
  TERMS_REQUIRED,
  TERMS_CONTENTS,
  TERMS_VERSION,
  TERMS_EFFECTIVE_DATE,
  type TermsKey,
} from "@/lib/terms-content";

interface Props {
  open: boolean;
  mode?: "agree" | "review";
  /** review 모드 진입 시 펼쳐서 보여줄 항목. */
  initialDoc?: TermsKey | null;
  /** agree 모드 — 동의 완료(위치 동의 여부 전달). */
  onAgree?: (locationAgreed: boolean) => void;
  /** review 모드 또는 닫기. */
  onClose?: () => void;
}

const isRequired = (k: TermsKey) => TERMS_REQUIRED.includes(k);

export default function TermsAgreementModal({ open, mode = "agree", initialDoc = null, onAgree, onClose }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<TermsKey | null>(initialDoc);
  if (!open) return null;

  const review = mode === "review";
  const allRequired = TERMS_REQUIRED.every((k) => checked[k]);
  const allChecked = TERMS_KEYS.every((k) => checked[k]);
  const toggle = (k: TermsKey) => setChecked((p) => ({ ...p, [k]: !p[k] }));
  const toggleAll = () => {
    const next = !allChecked;
    setChecked(Object.fromEntries(TERMS_KEYS.map((k) => [k, next])));
  };

  return (
    <div className="absolute inset-0 z-[100] flex flex-col bg-[var(--lv-bg)]">
      {/* 헤더 */}
      <div className="shrink-0 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+22px)]">
        {review && (
          <button onClick={onClose} aria-label="닫기" className="mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--lv-line-soft)] bg-white text-[color:var(--lv-ink)]"><X size={22} /></button>
        )}
        <div className="flex items-center gap-2.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--lv-accent-soft)]"><ShieldCheck size={26} className="text-[color:var(--lv-primary)]" /></div>
          <div className="min-w-0">
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-[color:var(--lv-ink)]">{review ? "약관 및 정책" : "시작하기 전에 동의해 주세요"}</h1>
            <p className="mt-0.5 text-[13px] font-semibold text-[color:var(--lv-muted)]">v{TERMS_VERSION} · 시행일 {TERMS_EFFECTIVE_DATE}</p>
          </div>
        </div>
        {!review && <p className="mt-2.5 text-[15px] font-semibold leading-snug text-[color:var(--lv-ink-soft)] [word-break:keep-all]">안전하게 기록하고 보조금 증빙에 쓰려면 아래 약관 동의가 필요해요.</p>}
      </div>

      {/* 전체 동의 (agree 모드) */}
      {!review && (
        <button onClick={toggleAll} className="mx-5 mb-2 flex shrink-0 items-center gap-3 rounded-2xl border border-[var(--lv-primary)] bg-[var(--lv-accent-soft)] px-4 py-3.5 text-left">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${allChecked ? "bg-[var(--lv-primary)]" : "border-2 border-[var(--lv-primary)] bg-white"}`}>{allChecked && <Check size={18} className="text-white" />}</span>
          <span className="text-[17px] font-extrabold text-[color:var(--lv-ink)]">약관 전체에 동의해요</span>
        </button>
      )}

      {/* 약관 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
        <div className="flex flex-col gap-2.5">
          {TERMS_KEYS.map((k) => {
            const open2 = expanded === k;
            const req = isRequired(k);
            return (
              <div key={k} className="overflow-hidden rounded-2xl border border-[var(--lv-line-soft)] bg-white">
                <div className="flex items-center gap-3 p-4">
                  {!review && (
                    <button onClick={() => toggle(k)} aria-pressed={!!checked[k]} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${checked[k] ? "bg-[var(--lv-primary)]" : "border-2 border-[var(--lv-line)] bg-white"}`}>{checked[k] && <Check size={18} className="text-white" />}</button>
                  )}
                  {review && k === "위치 기반 서비스 이용약관" && <MapPin size={18} className="shrink-0 text-[color:var(--lv-primary)]" />}
                  <button onClick={() => setExpanded(open2 ? null : k)} className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[16px] font-extrabold text-[color:var(--lv-ink)]">{k}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${req ? "bg-[var(--lv-warn-soft)] text-[color:var(--lv-warn)]" : "bg-[var(--lv-bg-soft)] text-[color:var(--lv-muted)]"}`}>{req ? "필수" : "선택"}</span>
                    </span>
                    <ChevronDown size={20} className={`shrink-0 text-[color:var(--lv-muted)] transition-transform ${open2 ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {open2 && (
                  <div className="max-h-[260px] overflow-y-auto border-t border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] px-4 py-3">
                    <pre className="whitespace-pre-wrap font-sans text-[13px] font-medium leading-relaxed text-[color:var(--lv-ink-soft)]">{TERMS_CONTENTS[k]}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 하단 CTA (agree 모드) */}
      {!review && (
        <div className="shrink-0 border-t border-[var(--lv-line-soft)] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-3.5">
          <button
            onClick={() => onAgree?.(!!checked["위치 기반 서비스 이용약관"])}
            disabled={!allRequired}
            className={`min-h-[60px] w-full rounded-2xl text-[19px] font-extrabold text-white transition-colors ${allRequired ? "bg-[var(--lv-primary)] shadow-[0_6px_16px_rgba(47,109,79,0.3)]" : "bg-[var(--lv-line)]"}`}>
            {allRequired ? "동의하고 시작하기" : "필수 약관에 동의해 주세요"}
          </button>
          <p className="mt-2 text-center text-[12px] font-semibold text-[color:var(--lv-muted)]">필수 항목 2개에 동의하면 시작할 수 있어요</p>
        </div>
      )}
    </div>
  );
}
