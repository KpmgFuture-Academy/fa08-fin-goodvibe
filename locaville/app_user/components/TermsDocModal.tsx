"use client";

/**
 * TermsDocModal — 설정에서 약관 1건을 화면 정중앙 팝업으로 보여주는 전용 모달.
 *  - 약관별(이용약관 / 개인정보처리방침 / 위치 기반 서비스 이용약관) 따로 열린다.
 *  - position: fixed 라 설정 화면을 아무리 스크롤해도 항상 화면 중앙에 뜬다.
 *    (기존 review 모달은 스크롤되는 설정 컨테이너 기준 absolute 라 화면 밖에 떠 "안 보였음".)
 */

import { ShieldCheck, X } from "lucide-react";
import {
  TERMS_CONTENTS,
  TERMS_VERSION,
  TERMS_EFFECTIVE_DATE,
  type TermsKey,
} from "@/lib/terms-content";

interface Props {
  /** 열 약관. null 이면 닫힘. */
  docKey: TermsKey | null;
  onClose: () => void;
}

export default function TermsDocModal({ docKey, onClose }: Props) {
  if (!docKey) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={docKey}
    >
      <div
        className="flex max-h-[82vh] w-full max-w-[400px] flex-col overflow-hidden rounded-3xl bg-white shadow-[0_20px_50px_rgba(0,0,0,0.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex shrink-0 items-start gap-3 border-b border-[var(--lv-line-soft)] px-5 pb-4 pt-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--lv-accent-soft)]">
            <ShieldCheck size={24} className="text-[color:var(--lv-primary)]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] font-extrabold leading-tight tracking-tight text-[color:var(--lv-ink)] [word-break:keep-all]">{docKey}</h2>
            <p className="mt-0.5 text-[12px] font-bold text-[color:var(--lv-muted)]">v{TERMS_VERSION} · 시행일 {TERMS_EFFECTIVE_DATE}</p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] text-[color:var(--lv-ink)]">
            <X size={20} />
          </button>
        </div>

        {/* 본문 (스크롤) */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--lv-bg-soft)] px-5 py-4">
          <pre className="whitespace-pre-wrap font-sans text-[14px] font-medium leading-relaxed text-[color:var(--lv-ink-soft)] [word-break:keep-all]">{TERMS_CONTENTS[docKey]}</pre>
        </div>

        {/* 하단 닫기 (시니어 친화 큰 버튼) */}
        <div className="shrink-0 border-t border-[var(--lv-line-soft)] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
          <button onClick={onClose} className="min-h-[52px] w-full rounded-2xl bg-[var(--lv-primary)] text-[17px] font-extrabold text-white">닫기</button>
        </div>
      </div>
    </div>
  );
}
