"use client";

/**
 * 이장님 액션 모달 3종 — 증빙 검토 / 문자 독려 / 도우미 연결.
 * 각 모달은 onDone(payload) 로 상위에 결과 전달 → Claude Code 가 lib/admin-api 에 배선.
 */

import { useState } from "react";
import { Btn, EvThumb, type Farmer, type InboxItem, Camera, Send, HeartHandshake, RefreshCw, Check, AlertCircle, X } from "./chief-ui";

// ── 공용 모달 셸 ──
export function ModalShell({ title, sub, onClose, children, foot }: {
  title: string; sub?: string; onClose: () => void; children: React.ReactNode; foot?: React.ReactNode;
}) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-6">
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        className="flex max-h-[88vh] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--lvb-line)] px-5 py-4">
          <div>
            <div className="text-[19px] font-extrabold text-[color:var(--lvb-ink)]">{title}</div>
            {sub && <div className="mt-0.5 text-[14px] font-semibold text-[color:var(--lvb-muted)]">{sub}</div>}
          </div>
          <button onClick={onClose} aria-label="닫기" className="flex h-10 w-10 items-center justify-center rounded-lg text-[color:var(--lvb-ink-soft)]"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {foot && <div className="flex justify-end gap-2.5 border-t border-[var(--lvb-line)] px-5 py-4">{foot}</div>}
      </div>
    </div>
  );
}

function FarmerLine({ f, fallback }: { f: Farmer; fallback: string }) {
  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl bg-[var(--lvb-bg-soft)] p-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--lvb-accent-soft)] text-[18px] font-extrabold text-[color:var(--lvb-accent-dark)]">{f.name[0]}</div>
      <div>
        <div className="text-[16px] font-extrabold text-[color:var(--lvb-ink)]">{f.name} <span className="text-[14px] font-semibold text-[color:var(--lvb-muted)]">({f.age}세)</span></div>
        <div className="text-[14px] font-semibold text-[color:var(--lvb-muted)]">{f.note || fallback}</div>
      </div>
    </div>
  );
}

const RETAKE_REASONS = [
  "사진이 흐려서 확인이 어려워요",
  "활동 내용이 사진에 안 보여요",
  "날짜·장소가 확인되지 않아요",
  "다른 활동 사진이 올라온 것 같아요",
];

// ── 1) 증빙 검토 ──
export function ReviewModal({ item, imgSrc, initialMode, onClose, onDone }: {
  item: InboxItem; imgSrc?: string; initialMode?: "view" | "retake";
  onClose: () => void; onDone: (p: { type: "confirm" | "retake"; evidence?: string; reason?: string }) => void;
}) {
  const blurry = item.evidence?.quality === "blurry";
  const [mode, setMode] = useState<"view" | "retake">(initialMode || "view");
  const [reason, setReason] = useState(blurry ? RETAKE_REASONS[0] : "");
  return (
    <ModalShell title={item.evidence?.label || "증빙 확인"} sub={`${item.farmer.name} 님 · ${item.evidence?.when ?? ""}`} onClose={onClose}
      foot={mode === "view" ? (
        <>
          <Btn variant="outline" size="lg" Icon={RefreshCw} onClick={() => setMode("retake")}>다시 받기 요청</Btn>
          <Btn variant="primary" size="lg" Icon={Check} onClick={() => onDone({ type: "confirm", evidence: item.evidence?.id })}>확인 완료</Btn>
        </>
      ) : (
        <>
          <Btn variant="ghost" size="lg" onClick={() => setMode("view")}>취소</Btn>
          <Btn variant="warn" size="lg" Icon={Send} onClick={() => onDone({ type: "retake", evidence: item.evidence?.id, reason })}>다시 받기 요청 보내기</Btn>
        </>
      )}>
      <div className="flex justify-center">
        <EvThumb src={imgSrc} label={item.evidence?.label} size={300} blurry={blurry} />
      </div>
      <div className={`mt-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[14px] font-bold ${blurry ? "bg-[var(--lvb-warn-soft)] text-[color:var(--lvb-warn-ink)]" : "bg-[var(--lvb-accent-soft)] text-[color:var(--lvb-accent-dark)]"}`}>
        {blurry ? <><AlertCircle size={16} />흐릿하게 찍혀 확인이 어려워요</> : <><Check size={16} />위치·시간 정보가 함께 기록됐어요</>}
      </div>
      {mode === "retake" && (
        <div className="mt-4">
          <div className="mb-2 text-[14px] font-extrabold text-[color:var(--lvb-ink-soft)]">다시 받는 이유 <span className="font-semibold text-[color:var(--lvb-muted)]">(농가에게 그대로 전달돼요)</span></div>
          <div className="flex flex-col gap-2">
            {RETAKE_REASONS.map((r) => (
              <button key={r} onClick={() => setReason(r)}
                className={`rounded-xl border px-3.5 py-3 text-left text-[15px] font-bold ${reason === r ? "border-[var(--lvb-accent)] bg-[var(--lvb-accent-soft)] text-[color:var(--lvb-accent-dark)]" : "border-[var(--lvb-line-2)] bg-white text-[color:var(--lvb-ink)]"}`}>{r}</button>
            ))}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── 2) 문자 독려 (미리보기 + 확인) ──
export function NudgeModal({ item, defaultText, onClose, onDone }: {
  item: InboxItem; defaultText: string;
  onClose: () => void; onDone: (p: { type: "nudge"; farmer: string; text: string }) => void;
}) {
  const [text, setText] = useState(defaultText);
  return (
    <ModalShell title="문자로 알려주기" sub={`${item.farmer.name} 님께 안내 문자를 보내요`} onClose={onClose}
      foot={<>
        <Btn variant="ghost" size="lg" onClick={onClose}>취소</Btn>
        <Btn variant="primary" size="lg" Icon={Send} onClick={() => onDone({ type: "nudge", farmer: item.farmer.id, text })}>이 내용으로 보내기</Btn>
      </>}>
      <FarmerLine f={item.farmer} fallback="기록이 밀려 있어요" />
      <div className="mb-2 text-[14px] font-extrabold text-[color:var(--lvb-ink-soft)]">보낼 문자 내용 <span className="font-semibold text-[color:var(--lvb-muted)]">(보내기 전 한 번 보세요 · 고쳐도 돼요)</span></div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
        className="w-full resize-none rounded-xl border border-[var(--lvb-line-2)] bg-white p-3.5 text-[15px] font-semibold leading-relaxed text-[color:var(--lvb-ink)] outline-none focus:border-[var(--lvb-accent)]" />
      <p className="mt-2 text-[13px] font-semibold text-[color:var(--lvb-muted)]">· {item.farmer.phone} 로 발송돼요</p>
    </ModalShell>
  );
}

// ── 3) 도우미 연결 (마을 주민 전체에서 검색·선택) ──
export function HelperModal({ farmer, residents, appliedHelperName, onClose, onDone }: {
  farmer: Farmer;
  /** 마을 주민 전체(해당 농가 제외). */
  residents: Farmer[];
  /** 농가가 직접 신청한 도우미 이름(있으면 승인 모드). */
  appliedHelperName?: string | null;
  onClose: () => void;
  onDone: (p: { type: "helper"; farmer: string; helper: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState(appliedHelperName || "");
  const matches = q.trim()
    ? residents.filter((r) => r.name.includes(q.trim()) || r.parcels.some((p) => p.name.includes(q.trim())))
    : residents;
  return (
    <ModalShell title="기록 도우미 연결"
      sub={appliedHelperName ? `${farmer.name} 님이 신청한 도우미를 승인해요` : `${farmer.name} 님의 기록을 함께 남길 마을 주민을 골라요`}
      onClose={onClose}
      foot={<>
        <Btn variant="ghost" size="lg" onClick={onClose}>취소</Btn>
        <Btn variant="primary" size="lg" Icon={HeartHandshake} disabled={!pick}
          onClick={() => pick && onDone({ type: "helper", farmer: farmer.id, helper: pick })}>{appliedHelperName ? "승인하고 연결" : "연결 요청 보내기"}</Btn>
      </>}>
      <FarmerLine f={farmer} fallback="기록을 함께 남기면 좋겠어요" />
      <div className="mb-2 text-[14px] font-extrabold text-[color:var(--lvb-ink-soft)]">도우미로 정할 마을 주민 <span className="font-semibold text-[color:var(--lvb-muted)]">(농가가 동의해야 연결돼요)</span></div>
      <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름이나 필지로 찾기" aria-label="마을 주민 검색"
        className="mb-2.5 w-full rounded-xl border border-[var(--lvb-line-2)] bg-white px-3.5 py-3 text-[15px] font-semibold text-[color:var(--lvb-ink)] outline-none focus:border-[var(--lvb-accent)]" />
      <div role="radiogroup" className="flex max-h-[252px] flex-col gap-2 overflow-y-auto">
        {matches.map((s) => {
          const on = pick === s.name;
          return (
            <button key={s.id} role="radio" aria-checked={on} onClick={() => setPick(s.name)}
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left ${on ? "border-[var(--lvb-accent)] bg-[var(--lvb-accent-soft)]" : "border-[var(--lvb-line-2)] bg-white"}`}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--lvb-bg-soft)] text-[15px] font-extrabold text-[color:var(--lvb-ink)]">{s.name[0]}</div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-[16px] font-extrabold text-[color:var(--lvb-ink)]">
                  {s.name} <span className="text-[13px] font-semibold text-[color:var(--lvb-muted)]">{s.age}세</span>
                  {s.name === appliedHelperName && <span className="rounded-full bg-[var(--lvb-accent-soft)] px-2 py-0.5 text-[11.5px] font-extrabold text-[color:var(--lvb-accent-dark)]">신청함</span>}
                </div>
                <div className="text-[14px] font-semibold text-[color:var(--lvb-muted)]">{s.parcels.map((p) => p.name).join("·")} · {s.helperFor ? "다른 농가를 돕는 중" : "이웃 농가"}</div>
              </div>
              <span aria-hidden className={`h-5 w-5 rounded-full border-2 ${on ? "border-[var(--lvb-accent)] bg-[var(--lvb-accent)]" : "border-[var(--lvb-line-2)]"}`} />
            </button>
          );
        })}
        {matches.length === 0 && <div className="py-4 text-center text-[14.5px] font-semibold text-[color:var(--lvb-muted)]">‘{q}’ 와 맞는 주민이 없어요</div>}
      </div>
      {pick && (
        <div className="mt-3 rounded-xl bg-[var(--lvb-bg-soft)] p-3.5">
          <div className="mb-1 text-[13px] font-extrabold text-[color:var(--lvb-muted)]">도우미에게 갈 안내</div>
          <p className="text-[15px] font-semibold leading-relaxed text-[color:var(--lvb-ink)]">{pick} 님, {farmer.name} 님의 영농 기록을 함께 남겨주시겠어요? {farmer.name} 님이 동의하면 앱에서 함께 사진과 일지를 남길 수 있어요.</p>
        </div>
      )}
    </ModalShell>
  );
}

/* Claude Code: onDone 페이로드를 lib/admin-api 에 배선 —
   confirm/retake → reviewEvidence, nudge → notifyLaggardFarmer(text),
   helper → createFarmHelper(farmer, helper). residents = 마을 주민 명단. */
