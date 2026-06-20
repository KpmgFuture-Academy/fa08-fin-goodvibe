"use client";

/**
 * HelperConsentModal — 기록 도우미 동의 모달 (nextjs_app 디자인 토큰).
 * 본인이 helper/recipient 로 배정됐고 본인 동의가 아직 안 된 경우 노출.
 * 연결: farm-helper-service.approveHelperPair (셸/컨테이너가 onApprove 로 호출).
 */

import { useState } from "react";
import { HeartHandshake, X } from "lucide-react";
import type { FarmHelperPair } from "@/lib/farm-helper-service";

interface Props {
  pair: FarmHelperPair;
  myRole: "helper" | "recipient";
  myFarmerId: string;
  open: boolean;
  onClose: () => void;
  onApprove: () => Promise<void> | void;
}

export default function HelperConsentModal({ pair, myRole, myFarmerId, open, onClose, onApprove }: Props) {
  const [submitting, setSubmitting] = useState(false);
  if (!open) return null;

  const counterpart =
    (myRole === "helper" ? pair.recipient_name : pair.helper_name) ||
    `농가 ${myRole === "helper" ? pair.recipient_user_no : pair.helper_user_no}`;
  const title = myRole === "helper" ? `${counterpart}님의 기록을 도와드릴까요?` : `${counterpart}님이 기록을 도와드린대요`;
  const description =
    myRole === "helper"
      ? `이장님께서 ${counterpart}님의 영농일지와 사진 올리는 걸 도와달라고 부탁하셨어요. 동의하시면 ${counterpart}님 대신 기록을 남겨주실 수 있어요.`
      : `이장님께서 ${counterpart}님께 기록을 도와드리라고 부탁하셨어요. 동의하시면 ${counterpart}님이 영농일지와 사진을 대신 올려드려요.`;

  async function handleApprove() {
    if (submitting) return;
    setSubmitting(true);
    try { await onApprove(); } finally { setSubmitting(false); }
  }

  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center bg-black/50 px-5">
      <div role="dialog" aria-modal className="relative w-full max-w-[420px] rounded-3xl bg-white p-[22px] shadow-[0_12px_36px_rgba(31,42,31,0.22)]">
        <button aria-label="닫기" onClick={onClose} className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--lv-ink-soft)]"><X size={20} /></button>

        <div className="mb-3.5 flex items-center gap-2.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--lv-primary)]"><HeartHandshake size={24} className="text-white" /></div>
          <h2 className="text-[18px] font-extrabold leading-snug text-[color:var(--lv-ink)] [word-break:keep-all]">{title}</h2>
        </div>

        <p className="text-[15px] font-semibold leading-relaxed text-[color:var(--lv-ink-soft)] [word-break:keep-all]">{description}</p>

        <div className="mt-4 flex flex-col gap-1.5 rounded-2xl bg-[var(--lv-bg-soft)] px-3.5 py-3">
          <span className="text-[12px] font-bold text-[color:var(--lv-ink-soft)]">예정 종료일</span>
          <span className="text-[16px] font-extrabold text-[color:var(--lv-ink)]">{pair.est_end_date || "지정 없음"}</span>
          <span className="text-[11px] font-semibold text-[color:var(--lv-muted)]">이장님께서 끝낼 때까지 계속 도와드려요.</span>
        </div>

        <div className="mt-[18px] flex gap-2.5">
          <button onClick={onClose} disabled={submitting} className="flex-1 rounded-2xl border border-[var(--lv-line)] bg-white py-3.5 text-[16px] font-bold text-[color:var(--lv-ink-soft)] disabled:opacity-50">나중에</button>
          <button onClick={() => void handleApprove()} disabled={submitting} className="flex-[1.4] rounded-2xl bg-[var(--lv-primary)] py-3.5 text-[16px] font-extrabold text-white shadow-[0_4px_12px_rgba(47,109,79,0.25)] disabled:opacity-60">{submitting ? "처리 중…" : "동의해요"}</button>
        </div>

        <p className="mt-2.5 text-center text-[10px] font-semibold text-[color:var(--lv-muted)]">내({myFarmerId}) 동의로 기록돼요.</p>
      </div>
    </div>
  );
}
