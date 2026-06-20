"use client";

/**
 * 이장님 액션 모달 3종 — lvb-modal* 클래스 기반.
 * 증빙 검토 / 문자 독려 / 도우미 연결.
 */

import { useState } from "react";
import { AlertCircle, Check, HeartHandshake, RefreshCw, Send, X } from "lucide-react";
import type { Farmer, InboxItem } from "./chief-ui";
import ModalPortal from "./ModalPortal";

// 영수증 금액 — "850000" / 850000 → "850,000원". 빈 값 / NaN 은 "—".
function formatAmount(v: number | string | undefined | null): string {
  if (v == null || v === "") return "—";
  const num = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(num)) return String(v);
  return `${num.toLocaleString("ko-KR")}원`;
}

// 영수증 품목 — 문자열 배열 또는 단일 문자열을 한 줄 요약. 너무 길면 잘라줌.
function formatItems(items: string[] | string | undefined | null): string {
  if (!items) return "—";
  const arr = Array.isArray(items) ? items : [String(items)];
  const joined = arr.filter(Boolean).join(", ");
  return joined.length > 60 ? joined.slice(0, 60) + "…" : (joined || "—");
}

export function ModalShell({
  title, sub, onClose, children, foot, wide,
}: {
  title: string; sub?: string; onClose: () => void;
  children: React.ReactNode; foot?: React.ReactNode; wide?: boolean;
}) {
  return (
    <ModalPortal open={true}>
      <div className="lvb-modal-scrim" onClick={onClose}>
        <div
          className={`lvb-modal${wide ? " lvb-modal-wide" : ""}`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="lvb-modal-head">
            <div>
              <div className="lvb-modal-title">{title}</div>
              {sub && <div className="lvb-modal-sub">{sub}</div>}
            </div>
            <button
              type="button"
              className="lvb-iconbtn"
              onClick={onClose}
              aria-label="닫기"
            >
              <X size={20} />
            </button>
          </div>
          <div className="lvb-modal-body">{children}</div>
          {foot && <div className="lvb-modal-foot">{foot}</div>}
        </div>
      </div>
    </ModalPortal>
  );
}

function FarmerLine({ f, fallback }: { f: Farmer; fallback: string }) {
  return (
    <div className="lvb-nudge-to">
      <div>
        <div className="lvb-meta-name">{f.name}</div>
        <div className="lvb-meta-sub">{f.note || fallback}</div>
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

// ISO 타임스탬프 → "2026년 6월 13일 10:13" (사용자 로컬시간). 파싱 실패 시 앞부분만.
function fmtUploadedTime(s?: string): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 16).replace("T", " ");
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ReviewModal({
  item, imgSrc, initialMode, onClose, onDone,
}: {
  item: InboxItem; imgSrc?: string; initialMode?: "view" | "retake";
  onClose: () => void;
  onDone: (p: { type: "confirm" | "retake"; evidence?: string; reason?: string }) => void;
}) {
  const blurry = item.evidence?.quality === "blurry";
  const [mode, setMode] = useState<"view" | "retake">(initialMode || "view");
  const [reason, setReason] = useState(blurry ? RETAKE_REASONS[0] : "");

  if (mode === "retake") {
    return (
      <ModalShell
        title="다시 받기 요청"
        sub={`${item.farmer.name} 님께 다시 찍어 달라고 알려요`}
        onClose={onClose}
        foot={
          <>
            <button type="button" className="lvb-btn lvb-btn-ghost lvb-btn-lg" onClick={() => setMode("view")}>
              뒤로
            </button>
            <button
              type="button"
              className="lvb-btn lvb-btn-warn lvb-btn-lg"
              disabled={!reason}
              onClick={() => onDone({ type: "retake", evidence: item.evidence?.id, reason })}
            >
              <Send size={22} />
              <span>다시 받기 요청 보내기</span>
            </button>
          </>
        }
      >
        <div className="lvb-field-label">
          어떤 점을 다시 받을까요?
        </div>
        <div className="lvb-reason-list" role="radiogroup">
          {RETAKE_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              className={`lvb-reason${reason === r ? " is-on" : ""}`}
              onClick={() => setReason(r)}
            >
              <span className="lvb-radio" />
              {r}
            </button>
          ))}
        </div>
        <div className="lvb-msg-preview">
          <div className="lvb-msg-preview-label">농가에게 갈 메시지</div>
          <p>
            {item.farmer.name} 님, 「{item.evidence?.label}」 사진을 다시 한 번 찍어 보내 주실 수 있을까요?
            {reason ? ` (${reason})` : ""} 도움이 필요하시면 이장에게 연락 주세요.
          </p>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title="증빙 사진 검토"
      sub={`${item.farmer.name} 님 · ${item.evidence?.label || ""}`}
      onClose={onClose}
      wide
      foot={
        <>
          <button
            type="button"
            className="lvb-btn lvb-btn-ghost lvb-btn-lg"
            onClick={() => setMode("retake")}
          >
            <RefreshCw size={22} />
            <span>다시 받기 요청</span>
          </button>
          <button
            type="button"
            className="lvb-btn lvb-btn-primary lvb-btn-lg"
            onClick={() => onDone({ type: "confirm", evidence: item.evidence?.id })}
          >
            <Check size={22} />
            <span>확인 완료</span>
          </button>
        </>
      }
    >
      <div className="lvb-review-grid">
        <div className="lvb-review-photo">
          {imgSrc ? (
            <img src={imgSrc} alt={item.evidence?.label || "증빙 사진"}
              className="lvb-evthumb" style={{ width: "100%", maxHeight: "48vh", objectFit: "contain", borderRadius: 16, background: "var(--lvb-bg-soft)" }} />
          ) : (
            <span className={`lvb-ph lvb-ph-${blurry ? "blur" : "field"}`}
              style={{ width: "100%", aspectRatio: "1", borderRadius: 16 }}>
              <span className="lvb-ph-cap">사진</span>
            </span>
          )}
          {blurry ? (
            <div className="lvb-quality-warn">
              <AlertCircle size={16} />
              흐릿하게 찍혀 확인이 어려워요
            </div>
          ) : (
            <div className="lvb-quality-ok">
              <Check size={16} />
              위치·시간 정보가 함께 기록됐어요
            </div>
          )}
          {item.evidence?.needsChiefVerification && (
            <div className="lvb-quality-warn" style={{ alignItems: "flex-start", wordBreak: "keep-all", lineHeight: 1.6 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 3 }} />
              <span>AI가 이 작업 사진이 맞는지 확신하지 못했어요{item.evidence?.matchReason ? ` — ${item.evidence.matchReason}` : ""}. 한 번 봐 주세요.</span>
            </div>
          )}
        </div>
        <div className="lvb-review-meta">
          <div className="lvb-meta-farmer">
            <div>
              <div className="lvb-meta-name">{item.farmer.name}</div>
              <div className="lvb-meta-sub">{item.farmer.phone || ""}</div>
            </div>
          </div>
          {item.projTag && (
            <div className="lvb-review-projrow">
              <span className="lvb-muted-label">사업</span>
              <span className="lvb-projtag t-green">{item.projTag.label}</span>
            </div>
          )}
          <div className="lvb-meta-row">
            <span>증빙 종류</span>
            <strong>{item.evidence?.label || "—"}</strong>
          </div>
          <div className="lvb-meta-row">
            <span>올라온 시간</span>
            <strong>{fmtUploadedTime(item.evidence?.when)}</strong>
          </div>
          {item.evidence?.receiptOcr?.vendor && (
            <div className="lvb-meta-row">
              <span>영수증 가맹점</span>
              <strong>{item.evidence.receiptOcr.vendor}</strong>
            </div>
          )}
          {item.evidence?.receiptOcr?.amount != null && item.evidence.receiptOcr.amount !== "" && (
            <div className="lvb-meta-row">
              <span>영수증 금액</span>
              <strong>{formatAmount(item.evidence.receiptOcr.amount)}</strong>
            </div>
          )}
          {item.evidence?.receiptOcr?.items && (
            <div className="lvb-meta-row">
              <span>품목</span>
              <strong>{formatItems(item.evidence.receiptOcr.items)}</strong>
            </div>
          )}
          {item.evidence?.receiptOcr?.date && (
            <div className="lvb-meta-row">
              <span>영수증 날짜</span>
              <strong>{item.evidence.receiptOcr.date}</strong>
            </div>
          )}
          <div className="lvb-review-hint">
            사진이 활동과 맞으면 <b>확인 완료</b>, 다시 받아야 하면 <b>다시 받기 요청</b>을 눌러 주세요.
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

export function NudgeModal({
  item, defaultText, onClose, onDone,
}: {
  item: InboxItem; defaultText: string;
  onClose: () => void;
  onDone: (p: { type: "nudge"; farmer: string; text: string }) => void;
}) {
  const [text, setText] = useState(defaultText);
  return (
    <ModalShell
      title="문자로 알려주기"
      sub={`${item.farmer.name} 님 · ${item.farmer.phone || ""}`}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="lvb-btn lvb-btn-ghost lvb-btn-lg" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="lvb-btn lvb-btn-primary lvb-btn-lg"
            onClick={() => onDone({ type: "nudge", farmer: item.farmer.id, text })}
          >
            <Send size={22} />
            <span>이 내용으로 보내기</span>
          </button>
        </>
      }
    >
      <FarmerLine f={item.farmer} fallback="기록이 밀려 있어요" />
      <div className="lvb-field-label">
        보낼 문자 내용 <span className="lvb-field-hint">(보내기 전 한 번 보세요 · 고쳐도 돼요)</span>
      </div>
      <textarea
        className="lvb-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
      />
    </ModalShell>
  );
}

export function HelperModal({
  farmer, residents, appliedHelperName, onClose, onDone,
}: {
  farmer: Farmer;
  residents: Farmer[];
  appliedHelperName?: string | null;
  onClose: () => void;
  onDone: (p: { type: "helper"; farmer: string; helper: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState(appliedHelperName || "");
  const matches = q.trim()
    ? residents.filter((r) =>
        r.name.includes(q.trim()) ||
        r.parcels.some((p) => p.name.includes(q.trim())),
      )
    : residents;

  return (
    <ModalShell
      title="기록 도우미 연결"
      sub={
        appliedHelperName
          ? `${farmer.name} 님이 신청한 도우미를 승인해요`
          : `${farmer.name} 님의 기록을 함께 남길 마을 주민을 골라요`
      }
      onClose={onClose}
      foot={
        <>
          <button type="button" className="lvb-btn lvb-btn-ghost lvb-btn-lg" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="lvb-btn lvb-btn-primary lvb-btn-lg"
            disabled={!pick}
            onClick={() => pick && onDone({ type: "helper", farmer: farmer.id, helper: pick })}
          >
            <HeartHandshake size={22} />
            <span>{appliedHelperName ? "승인하고 연결" : "연결 요청 보내기"}</span>
          </button>
        </>
      }
    >
      <FarmerLine f={farmer} fallback="기록을 함께 남기면 좋겠어요" />
      <div className="lvb-field-label">
        도우미로 정할 마을 주민 <span className="lvb-field-hint">(농가가 동의해야 연결돼요)</span>
      </div>
      <input
        className="lvb-input"
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="이름이나 필지로 찾기"
        aria-label="마을 주민 검색"
      />
      <div className="lvb-helper-list lvb-helper-scroll" role="radiogroup">
        {matches.map((s) => {
          const on = pick === s.name;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={`lvb-helper-opt${on ? " is-on" : ""}`}
              onClick={() => setPick(s.name)}
            >
              <div className="lvb-helper-opt-txt">
                <div className="lvb-helper-opt-name">
                  {s.name}
                  {s.name === appliedHelperName && (
                    <span className="lvb-helper-pre">신청함</span>
                  )}
                </div>
                <div className="lvb-helper-opt-rel">
                  {s.parcels.map((p) => p.name).join("·")} ·{" "}
                  {s.helperFor ? "다른 농가를 돕는 중" : "이웃 농가"}
                </div>
              </div>
              <span className="lvb-radio" />
            </button>
          );
        })}
        {matches.length === 0 && (
          <div className="lvb-helper-empty">'{q}' 와 맞는 주민이 없어요</div>
        )}
      </div>
      {pick && (
        <div className="lvb-msg-preview">
          <div className="lvb-msg-preview-label">도우미에게 갈 안내</div>
          <p>
            {pick} 님, {farmer.name} 님의 영농 기록을 함께 남겨주시겠어요?{" "}
            {farmer.name} 님이 동의하면 앱에서 함께 사진과 일지를 남길 수 있어요.
          </p>
        </div>
      )}
    </ModalShell>
  );
}
