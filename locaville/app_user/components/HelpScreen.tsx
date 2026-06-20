"use client";

/**
 * HelpScreen — 쉬운 모드: 큰 전화 버튼 + FAQ 펼치기 / 표준 모드: 챗.
 * FAQ 데이터는 props 로 주입.
 */

import { useState, useRef, useEffect } from "react";
import { Phone, ChevronRight, Bot, Send, Mic, MicOff, Loader } from "lucide-react";
import { requestActivityHelp, requestOpenAiStt } from "@/lib/ai-service";

// ── 음성 녹음 헬퍼 (ManualInputScreen 과 동일 패턴) ──
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

export interface FaqItem { q: string; a: string; }

interface HelpScreenProps {
  faq: FaqItem[];
  easy?: boolean;
  /** 도움센터 전화 (tel: 링크 등). */
  onCall?: () => void;
  /** 챗 답변 생성 — 미연결 시 FAQ 기반 폴백. */
  answerFor?: (q: string) => string;
}

export default function HelpScreen({ faq, easy = false, onCall, answerFor }: HelpScreenProps) {
  const [toast, setToast] = useState("");
  const [openIdx, setOpenIdx] = useState(0);

  if (easy) {
    return (
      <div className="relative min-h-full bg-[var(--lv-bg)] pb-7">
        <div className="px-4 pb-1 pt-4">
          <h1 className="text-[28px] font-extrabold tracking-tight text-[color:var(--lv-ink)]">도움말</h1>
          <p className="mt-1 text-[16px] font-semibold text-[color:var(--lv-ink-soft)]">궁금한 걸 골라보세요.</p>
        </div>

        <div className="px-4 pb-2 pt-3">
          <button onClick={() => { onCall?.(); setToast("도움센터 1588-0000 으로 전화를 걸어요"); setTimeout(() => setToast(""), 2600); }}
            className="flex w-full items-center gap-3.5 rounded-[18px] bg-[var(--lv-primary)] p-[18px] text-left text-white shadow-[0_8px_18px_rgba(47,109,79,0.24)]">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white/[0.18]"><Phone size={26} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[20px] font-extrabold leading-tight">도움센터에 전화하기</p>
              <p className="mt-0.5 text-[15px] font-semibold text-white/90">상담원이 직접 도와드려요</p>
            </div>
          </button>
        </div>

        {/* 쉬운 모드 RAG 챗봇 — 큰 입력 + 큰 마이크 + 큰 답변. 시니어 친화 사이즈. */}
        <div className="px-4 pb-1 pt-3">
          <EasyChatCard faq={faq} />
        </div>

        <p className="px-[18px] pb-2 pt-2.5 text-[15px] font-extrabold text-[color:var(--lv-muted)]">자주 묻는 질문</p>
        <div className="lv-stagger mx-4 flex flex-col gap-3">
          {faq.map((f, i) => {
            const open = openIdx === i;
            return (
              <div key={i} className="overflow-hidden rounded-[18px] border border-[var(--lv-line-soft)] bg-[var(--lv-card)] shadow-[0_1px_2px_rgba(31,42,31,0.04),0_6px_14px_rgba(31,42,31,0.04)]">
                <button onClick={() => setOpenIdx(open ? -1 : i)} className="flex w-full items-center gap-3 p-[18px] text-left">
                  <span className="flex-1 text-[18px] font-extrabold leading-snug text-[color:var(--lv-ink)] [word-break:keep-all]">{f.q}</span>
                  <ChevronRight size={22} className={`shrink-0 text-[color:var(--lv-ink-soft)] transition-transform ${open ? "rotate-90" : ""}`} />
                </button>
                {open && <div className="px-[18px] pb-[18px]"><p className="text-[17px] font-medium leading-relaxed text-[color:var(--lv-ink)] [word-break:keep-all]">{f.a}</p></div>}
              </div>
            );
          })}
        </div>
        <p className="px-5 pt-4 text-[15px] font-semibold leading-snug text-[color:var(--lv-ink-soft)]">더 궁금하면 마을 이장님께 여쭤봐도 좋아요.</p>

        {toast && <div role="status" aria-live="polite" className="absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--lv-ink)] px-5 py-3 text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(0,0,0,0.25)]">{toast}</div>}
      </div>
    );
  }

  return <ChatHelp faq={faq} answerFor={answerFor} />;
}

interface Msg { id: number; role: "bot" | "user"; text: string; }

function ChatHelp({ faq, answerFor }: { faq: FaqItem[]; answerFor?: (q: string) => string }) {
  const [messages, setMessages] = useState<Msg[]>([{ id: 0, role: "bot", text: "안녕하세요. 궁금한 점을 편하게 물어보세요." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  const fallback = (text: string) => {
    const f = faq.find((x) => x.q === text);
    if (f) return f.a;
    if (/사진|증빙|찍/.test(text)) return faq[1]?.a ?? "";
    if (/일지|기록|왜/.test(text)) return faq[0]?.a ?? "";
    return "저탄소 농업 프로그램은 활동 기록(사진·일지)이 핵심이에요. 더 정확한 내용은 사업 공고문이나 마을 이장님께 확인해 주세요.";
  };

  // 답변 해석 — answerFor(주입) > RAG(ai-service /ai/chat) > FAQ 폴백.
  async function resolveAnswer(text: string): Promise<string> {
    if (answerFor) return answerFor(text);
    try {
      const res = await requestActivityHelp(text, null);
      if (res?.answer?.trim()) return res.answer.trim();
    } catch {
      /* 네트워크/미연결 → FAQ 폴백 */
    }
    return fallback(text);
  }

  function ask(text: string) {
    if (!text || loading) return;
    const now = Date.now();
    setMessages((p) => [...p, { id: now, role: "user", text }]);
    setLoading(true);
    const botId = now + 1;
    void resolveAnswer(text).then((full) => {
      setLoading(false);
      setMessages((p) => [...p, { id: botId, role: "bot", text: "" }]);
      let i = 0;
      const timer = setInterval(() => {
        i = Math.min(i + 2, full.length);
        setMessages((p) => p.map((m) => (m.id === botId ? { ...m, text: full.slice(0, i) } : m)));
        if (i >= full.length) clearInterval(timer);
      }, 24);
    });
  }
  const send = () => { const t = input.trim(); if (!t) return; setInput(""); ask(t); };

  return (
    <div className="flex h-full flex-col bg-[var(--lv-bg)]">
      <div className="shrink-0 px-4 pb-1 pt-4">
        <h1 className="text-[24px] font-extrabold text-[color:var(--lv-ink)]">도움말</h1>
        <p className="mt-0.5 text-[14px] font-bold text-[color:var(--lv-muted)]">궁금한 점을 물어보세요.</p>
      </div>
      <div className="shrink-0 px-4 pb-1 pt-3">
        <p className="mb-2 text-[15px] font-bold text-[color:var(--lv-muted)]">이런 걸 물어볼 수 있어요</p>
        <div className="flex flex-col gap-2">
          {faq.map((f, i) => (
            <button key={i} onClick={() => ask(f.q)} disabled={loading}
              className="rounded-2xl border border-[var(--lv-line-soft)] bg-[var(--lv-card)] p-3.5 text-left text-[16px] font-bold leading-snug text-[color:var(--lv-ink)] [word-break:keep-all] disabled:opacity-60">{f.q}</button>
          ))}
        </div>
      </div>
      <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {messages.map((m) => (
          <div key={m.id} className={`flex items-end gap-2 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
            {m.role === "bot" && <div className="shrink-0 self-start rounded-full bg-[var(--lv-primary)] p-1.5"><Bot size={16} className="text-white" /></div>}
            <div className={`max-w-[78%] whitespace-pre-wrap rounded-[18px] px-4 py-3 text-[15px] font-semibold leading-relaxed [word-break:keep-all] ${m.role === "user" ? "rounded-br-md bg-[var(--lv-primary)] text-white" : "rounded-bl-md border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] text-[color:var(--lv-ink)]"}`}>{m.text}</div>
          </div>
        ))}
        {loading && <div className="flex items-end gap-2"><div className="shrink-0 rounded-full bg-[var(--lv-primary)] p-1.5"><Bot size={16} className="text-white" /></div><div className="rounded-[18px] rounded-bl-md border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] px-4 py-3 text-[15px] text-[color:var(--lv-muted)]">…</div></div>}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--lv-line-soft)] bg-white px-4 py-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="질문을 입력하거나 마이크를 누르세요."
          className="flex-1 rounded-2xl border border-[var(--lv-line)] bg-white px-4 py-3 text-[15px] font-semibold text-[color:var(--lv-ink)] outline-none" />
        <button onClick={send} className="shrink-0 rounded-2xl bg-[var(--lv-primary)] p-3 text-white shadow-[0_4px_12px_rgba(47,109,79,0.25)]">{input.trim() ? <Send size={20} /> : <Mic size={20} />}</button>
      </div>
    </div>
  );
}

/**
 * 쉬운 모드용 큰 챗 카드 — RAG (`/ai/chat`) + STT 마이크.
 * - 한 화면에 마지막 질문/답변만 보여 시니어 친화.
 * - 마이크: MediaRecorder → `requestOpenAiStt` → 인식 텍스트가 입력에 자동 입력.
 * - Enter / 보내기 → `requestActivityHelp` → 답변 표시 (typewriter 비활성 — 시니어 가독성 우선).
 */
function EasyChatCard({ faq }: { faq: FaqItem[] }) {
  const [input, setInput] = useState("");
  const [lastQ, setLastQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sttProcessing, setSttProcessing] = useState(false);
  const [sttMessage, setSttMessage] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const micSupported = canUseMicRecording();

  useEffect(() => {
    return () => {
      try { recorderRef.current?.stop(); } catch { /* ignore */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function fallback(text: string): string {
    const hit = faq.find((x) => x.q === text);
    if (hit) return hit.a;
    if (/사진|증빙|찍/.test(text)) return faq[1]?.a ?? "";
    if (/일지|기록|왜/.test(text)) return faq[0]?.a ?? "";
    return "저탄소 농업 프로그램은 활동 기록(사진·일지)이 핵심이에요. 정확한 내용은 마을 이장님께 여쭤보세요.";
  }

  async function ask(text: string) {
    if (!text || loading) return;
    setLoading(true);
    setLastQ(text);
    setAnswer("");
    try {
      const res = await requestActivityHelp(text, null);
      const t = res?.answer?.trim();
      setAnswer(t || fallback(text));
    } catch {
      setAnswer(fallback(text));
    } finally {
      setLoading(false);
    }
  }

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
        const file = new File([blob], `help_${Date.now()}.${ext}`, { type: mimeUsed });
        const stt = await requestOpenAiStt(file);
        setSttProcessing(false);
        if (!stt || !stt.text) {
          setSttMessage(stt?.error_message || "음성을 인식하지 못했어요.");
          return;
        }
        setInput(stt.text.trim());
        setSttMessage("");
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
    try { recorderRef.current?.stop(); } catch { setSttProcessing(false); }
  }

  const send = () => { const t = input.trim(); if (!t) return; setInput(""); void ask(t); };

  return (
    <div className="rounded-[18px] border border-[var(--lv-line-soft)] bg-[var(--lv-card)] p-4 shadow-[0_1px_2px_rgba(31,42,31,0.04),0_6px_14px_rgba(31,42,31,0.04)]">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--lv-primary)]">
          <Bot size={18} className="text-white" />
        </div>
        <p className="text-[18px] font-extrabold text-[color:var(--lv-ink)]">AI에게 물어보기</p>
      </div>

      {(lastQ || loading || answer) && (
        <div className="mb-3 flex flex-col gap-2.5">
          {lastQ && (
            <div className="self-end max-w-[90%] rounded-2xl rounded-br-md bg-[var(--lv-primary)] px-3.5 py-2.5 text-[15px] font-bold text-white [word-break:keep-all]">
              {lastQ}
            </div>
          )}
          {loading ? (
            <div className="self-start max-w-[90%] rounded-2xl rounded-bl-md border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] px-3.5 py-2.5 text-[16px] font-bold text-[color:var(--lv-muted)]">
              답을 찾고 있어요…
            </div>
          ) : answer ? (
            <div className="self-start rounded-2xl rounded-bl-md border border-[var(--lv-line-soft)] bg-[var(--lv-bg-soft)] px-3.5 py-3 text-[17px] font-semibold leading-relaxed text-[color:var(--lv-ink)] [word-break:keep-all]">
              {answer}
            </div>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="궁금한 점을 말씀해 보세요"
          disabled={loading || recording || sttProcessing}
          className="flex-1 rounded-2xl border border-[var(--lv-line)] bg-white px-4 py-3.5 text-[17px] font-semibold text-[color:var(--lv-ink)] outline-none disabled:opacity-60"
        />
        {/* 입력이 비면 음성인식, 입력이 있으면 보내기 — 버튼 하나만 노출(줄 넘침 방지).
            마이크를 못 쓰는 기기면 항상 보내기 버튼. */}
        {input.trim() || !micSupported ? (
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            aria-label="보내기"
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-[var(--lv-primary)] text-white shadow-[0_4px_12px_rgba(47,109,79,0.25)] disabled:opacity-40"
          >
            <Send size={24} />
          </button>
        ) : (
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={sttProcessing || loading}
            aria-label={recording ? "녹음 멈추기" : "녹음 시작"}
            className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_4px_12px_rgba(47,109,79,0.25)] ${
              recording ? "bg-[color:var(--lv-warn)] lv-orb-pulse" : "bg-[color:var(--lv-primary)]"
            } ${sttProcessing ? "opacity-60" : ""}`}
          >
            {sttProcessing ? <Loader size={22} className="animate-spin" /> : recording ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
        )}
      </div>
      {sttMessage && (
        <p className="mt-2 text-[14px] font-bold text-[color:var(--lv-warn)] [word-break:keep-all]">{sttMessage}</p>
      )}
    </div>
  );
}

/* Claude Code: answerFor = ai-service(RAG /ai/chat). faq = 정적 또는 advice-service. */
