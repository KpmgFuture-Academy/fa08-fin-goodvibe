"use client";

/** 도움말 화면 — FAQ + RAG 채팅 (`/ai/chat`). 사용자가 사업·증빙 관련 질문을 자유롭게 물을 수 있음. */

import { useState, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import { Send, Bot, Mic, Square, Volume2, Loader2 } from "lucide-react";
import { streamActivityHelp, requestOpenAiStt, requestOpenAiTts } from "@/lib/ai-service";
import { speak as fallbackSpeak, stopSpeak as fallbackStop, ttsSupported } from "@/lib/tts-service";

interface Message {
  id: number;
  role: "user" | "bot";
  text: string;
}

// 가장 자주 묻는 2개만 보여줘 채팅 영역을 충분히 확보. 나머지는 직접 입력으로 유도.
const QUICK_QUESTIONS = [
  "영농일지는 왜 기록해야 하나요?",
  "사진 증빙은 어떤 기준으로 찍어야 하나요?",
];

const FALLBACK_ANSWER =
  "입력하신 내용을 기준으로 일반 안내를 드릴게요. 더 정확한 내용은 사업 공고문 또는 담당자 안내를 함께 확인해 주세요.";

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5" aria-label="AI 작성 중">
      <span
        className="h-2.5 w-2.5 rounded-full bg-primary"
        style={{ animation: "typing-bounce 1s infinite ease-in-out", animationDelay: "0ms" }}
      />
      <span
        className="h-2.5 w-2.5 rounded-full bg-primary"
        style={{ animation: "typing-bounce 1s infinite ease-in-out", animationDelay: "150ms" }}
      />
      <span
        className="h-2.5 w-2.5 rounded-full bg-primary"
        style={{ animation: "typing-bounce 1s infinite ease-in-out", animationDelay: "300ms" }}
      />
    </div>
  );
}

type RecordingState = "idle" | "recording" | "transcribing";
type TtsState =
  | { kind: "idle" }
  | { kind: "loading"; messageId: number }
  | { kind: "playing"; messageId: number };

const MAX_RECORD_MS = 30_000;

export default function HelpScreen() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "bot", text: "안녕하세요. 궁금한 점을 편하게 물어보세요." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // 채팅 영역 자체의 scroll container — bottomRef.scrollIntoView 가 페이지 전체를 스크롤하지
  // 않도록 명시적 ref 로 chat container 만 scrollTop 조작.
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // STT 녹음 — MediaRecorder + chunks. 정지 시 STT 호출 → input 에 채움 (자동 전송 X).
  const [recording, setRecording] = useState<RecordingState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  // TTS — 봇 답변 스피커. 한 번에 하나만 재생. 새 메시지 재생 시 이전 정지.
  const [tts, setTts] = useState<TtsState>({ kind: "idle" });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // 키보드 등장 감지 — visualViewport API 로 키보드 높이 계산.
  // 입력바를 키보드 바로 위로 끌어올리고 body class 로 하단 탭바 자동 숨김.
  // iOS Safari 가 fixed bottom 요소를 키보드와 함께 안 올려주는 이슈 해결.
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
      const open = offset > 50;
      setKeyboardOffset(open ? offset : 0);
      document.body.classList.toggle("lv-keyboard-open", open);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.body.classList.remove("lv-keyboard-open");
    };
  }, []);

  function stopTts() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    fallbackStop();
    setTts({ kind: "idle" });
  }

  async function playTts(messageId: number, text: string) {
    if (!text.trim()) return;
    // 같은 메시지 재생 중이면 토글로 정지
    if (tts.kind === "playing" && tts.messageId === messageId) {
      stopTts();
      return;
    }
    stopTts();
    setTts({ kind: "loading", messageId });
    const resp = await requestOpenAiTts(text);
    if (resp && resp.audio_url) {
      const audio = new Audio(resp.audio_url);
      audioRef.current = audio;
      audioUrlRef.current = resp.audio_url;
      audio.onended = () => stopTts();
      audio.onerror = () => stopTts();
      try {
        await audio.play();
        setTts({ kind: "playing", messageId });
      } catch {
        stopTts();
      }
    } else if (ttsSupported()) {
      // OpenAI TTS 실패 → 브라우저 speechSynthesis 폴백
      fallbackSpeak(text, { rate: 0.95 });
      setTts({ kind: "playing", messageId });
      // speechSynthesis 는 onend 정확 안 보장 — 텍스트 길이로 대충 추정
      const estMs = Math.min(20_000, Math.max(2_000, text.length * 90));
      window.setTimeout(() => {
        if (tts.kind === "playing" && tts.messageId === messageId) stopTts();
      }, estMs);
    } else {
      setTts({ kind: "idle" });
    }
  }

  useEffect(() => {
    return () => {
      // unmount 시 정리
      stopTts();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (recordTimerRef.current) window.clearTimeout(recordTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    if (recording !== "idle" || loading) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      window.alert("이 브라우저에서는 음성 인식을 지원하지 않아요.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        // 트랙 정리
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) {
          window.clearTimeout(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        if (blob.size < 500) {
          setRecording("idle");
          return;
        }
        setRecording("transcribing");
        const file = new File([blob], "voice.webm", { type: "audio/webm" });
        const stt = await requestOpenAiStt(file, "ko");
        setRecording("idle");
        if (stt && stt.text.trim()) {
          // 인식된 텍스트를 input 에 채움 — 자동 전송 X (사용자 확인 후 ➤)
          setInput((prev) => (prev ? `${prev} ${stt.text.trim()}` : stt.text.trim()));
        } else {
          window.alert("음성 인식이 잘 안 됐어요. 다시 시도해 주세요.");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording("recording");
      // 30초 자동 정지
      recordTimerRef.current = window.setTimeout(() => {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }, MAX_RECORD_MS);
    } catch (e) {
      window.alert("마이크 권한이 필요해요. 브라우저 설정에서 허용해 주세요.");
      setRecording("idle");
    }
  }

  function stopRecording() {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      try {
        r.stop();
      } catch {
        // ignore
      }
    }
  }
  // 메시지 갯수 증가를 감지해 스크롤. Strict Mode 의 effect 2회 mount 에서도 안전 —
  // 진입 시 prevLen == messages.length 라 자동 스크롤 안 일어남.
  const prevMessagesLen = useRef(messages.length);

  useEffect(() => {
    if (messages.length > prevMessagesLen.current) {
      // chat container 만 스크롤 — 페이지 전체 (body) 가 스크롤 다운되어 FAQ 카드가
      // 시야에서 사라지는 어색한 UX 방지. scrollIntoView 는 nearest container 만
      // 스크롤하지 않고 ancestor 까지 거슬러 올라가는 경우가 있어 chat 영역 직접 조작.
      const el = chatScrollRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }
    prevMessagesLen.current = messages.length;
  }, [messages]);

  async function askWithAi(text: string) {
    if (!text || loading) return;

    const now = Date.now();
    const userMsg: Message = { id: now, role: "user", text };
    const botPlaceholderId = now + 1;

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const threadForApi = [...messages, userMsg]
      .slice(-12)
      .map((m) => ({
        role: (m.role === "bot" ? "assistant" : "user") as "user" | "assistant",
        content: m.text,
      }))
      .filter((m) => m.content.trim());

    // OpenAI 가 큰 chunk 로 token 보내서 진짜 점진 출력 안 됨 → typewriter pattern.
    let bufferText = "";
    let displayedLen = 0;
    let botAdded = false;
    let streamDone = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    function tick() {
      if (displayedLen < bufferText.length) {
        displayedLen = Math.min(displayedLen + 1, bufferText.length);
        const slice = bufferText.slice(0, displayedLen);
        if (!botAdded) {
          botAdded = true;
          flushSync(() => {
            setLoading(false);
            setMessages((prev) => [...prev, { id: botPlaceholderId, role: "bot", text: slice }]);
          });
        } else {
          flushSync(() => {
            setMessages((prev) =>
              prev.map((m) => (m.id === botPlaceholderId ? { ...m, text: slice } : m)),
            );
          });
        }
      } else if (streamDone && timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function startTypewriter() {
      if (timer) return;
      timer = setInterval(tick, 28);  // ~36자/초 — ChatGPT 와 비슷한 차분한 속도
    }

    await streamActivityHelp(threadForApi, {
      onToken: (delta) => {
        bufferText += delta;
        startTypewriter();
      },
      onFinal: (resp) => {
        if (resp.answer?.trim()) bufferText = resp.answer.trim();
      },
      onError: (detail) => {
        if (!botAdded && !bufferText) {
          bufferText = `도움말 서버 오류: ${detail}`;
          startTypewriter();
        }
      },
    });

    streamDone = true;
    while (timer) {
      await new Promise((r) => setTimeout(r, 30));
    }
    if (!botAdded) {
      const fallback = /(전화|연락|담당자|번호)/.test(text)
        ? "현재 문서에서 담당자 전화번호를 찾지 못했습니다. 사업 공고문의 연락처 항목이나 읍면동 담당자 안내를 확인해 주세요."
        : FALLBACK_ANSWER;
      setMessages((prev) => [...prev, { id: botPlaceholderId, role: "bot", text: fallback }]);
    }
    setLoading(false);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    await askWithAi(text);
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      <style jsx global>{`
        @keyframes typing-bounce {
          0%,
          80%,
          100% {
            transform: translateY(0);
            opacity: 0.45;
          }
          40% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }
        @keyframes lv-mic-pulse-kf {
          0%, 100% { transform: scale(1);   opacity: 0.9; }
          50%      { transform: scale(1.3); opacity: 1;   }
        }
        .lv-mic-pulse {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--danger, #d04545);
          animation: lv-mic-pulse-kf 1s ease-in-out infinite;
        }
        /* 키보드 등장 시 LocavilleApp 의 하단 탭바를 숨김 — 입력바와 시각 충돌 회피. */
        body.lv-keyboard-open .lv-bottom-nav {
          display: none;
        }
      `}</style>
      <div className="px-4 pt-5 pb-1 flex-shrink-0">
        <h1 className="text-2xl font-bold text-foreground">도움말</h1>
        <p className="text-sm font-bold text-muted-foreground mt-0.5">궁금한 점을 물어보세요.</p>
      </div>

      <div className="px-4 flex-shrink-0 mb-2 mt-3">
        <p className="text-base font-bold text-muted-foreground mb-2">이런 걸 물어볼 수 있어요</p>
        <div className="flex flex-col gap-2">
          {QUICK_QUESTIONS.map((q, i) => (
            <button
              key={i}
              onClick={() => void askWithAi(q)}
              disabled={loading}
              className="jt-mobile-card rounded-2xl p-4 text-left active:opacity-90 disabled:opacity-60"
            >
              <span className="text-lg font-bold text-foreground leading-snug">{q}</span>
            </button>
          ))}
        </div>
      </div>

      <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ paddingBottom: 88 }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-end gap-2 animate-fade-in ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            {msg.role === "bot" && (
              <div
                className="rounded-full p-1.5 flex-shrink-0 self-start"
                style={{ background: "var(--primary)" }}
              >
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div className="flex flex-col gap-1 max-w-[75%]">
              <div
                className="px-4 py-3 text-base font-bold leading-relaxed rounded-2xl whitespace-pre-wrap"
                style={
                  msg.role === "user"
                    ? {
                        background: "var(--primary)",
                        color: "#ffffff",
                        borderBottomRightRadius: 6,
                        boxShadow: "0 2px 8px rgba(47, 109, 79, 0.20)",
                      }
                    : {
                        background: "var(--bg-soft)",
                        border: "1px solid var(--line-soft)",
                        color: "var(--ink)",
                        borderBottomLeftRadius: 6,
                      }
                }
              >
                {msg.text}
              </div>
              {/* 봇 답변에만 TTS 스피커 — 첫 인사 (id=0) 는 짧으니 제외, 실제 답변만. */}
              {msg.role === "bot" && msg.id !== 0 && msg.text.trim() && (
                <button
                  type="button"
                  onClick={() => void playTts(msg.id, msg.text)}
                  className="self-start active:opacity-70 inline-flex items-center gap-1.5"
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "4px 4px",
                    color: "var(--ink-soft)",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                  aria-label={
                    tts.kind === "playing" && tts.messageId === msg.id
                      ? "읽기 중지"
                      : "음성으로 듣기"
                  }
                >
                  {tts.kind === "loading" && tts.messageId === msg.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : tts.kind === "playing" && tts.messageId === msg.id ? (
                    <Square className="w-3.5 h-3.5" style={{ color: "var(--primary)" }} />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {tts.kind === "loading" && tts.messageId === msg.id
                      ? "준비 중…"
                      : tts.kind === "playing" && tts.messageId === msg.id
                        ? "정지"
                        : "들어보기"}
                  </span>
                </button>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-end gap-2">
            <div className="rounded-full p-1.5 flex-shrink-0" style={{ background: "var(--primary)" }}>
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div
              className="px-4 py-2.5 rounded-2xl"
              style={{
                background: "var(--bg-soft)",
                border: "1px solid var(--line-soft)",
                borderBottomLeftRadius: 6,
              }}
            >
              <TypingIndicator />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* input bar: nav 바로 위에 fixed. 우측 버튼은 input 상태에 따라 morph:
            - 입력 비어있음 + idle  → 마이크 (녹음 시작)
            - 녹음 중                → 정지 (빨강)
            - STT 처리 중            → loading spinner
            - 입력 있음              → 보내기 (➤)
          녹음 중에는 input 자리에 "🎤 듣고 있어요…" 표시로 시각 명확화. */}
      <div
        className="fixed left-0 right-0 px-4 py-3 flex gap-2 z-40 items-center"
        style={{
          // 키보드 등장 시 키보드 바로 위에 붙임. 아니면 nav 위 (bottom 92).
          bottom: keyboardOffset > 0 ? keyboardOffset + 8 : 92,
          background: "#ffffff",
          borderTop: "1px solid var(--line-soft)",
          boxShadow: "0 -2px 8px rgba(31, 42, 31, 0.06)",
          transition: "bottom 0.2s ease",
        }}
      >
        {recording === "recording" ? (
          <div
            className="flex-1 rounded-2xl px-4 py-3 text-base font-bold flex items-center gap-2"
            style={{
              background: "rgba(208, 69, 69, 0.08)",
              border: "1px solid rgba(208, 69, 69, 0.25)",
              color: "var(--danger)",
            }}
          >
            <span className="lv-mic-pulse" />
            <span>듣고 있어요…</span>
          </div>
        ) : recording === "transcribing" ? (
          <div
            className="flex-1 rounded-2xl px-4 py-3 text-base font-bold flex items-center gap-2"
            style={{
              background: "var(--bg-soft)",
              border: "1px solid var(--line-soft)",
              color: "var(--ink-soft)",
            }}
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>알아듣는 중…</span>
          </div>
        ) : (
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void sendMessage()}
            disabled={loading}
            placeholder="질문을 입력하거나 마이크를 누르세요."
            className="flex-1 rounded-2xl px-4 py-3 text-base font-bold focus:outline-none focus:border-primary disabled:opacity-50"
            style={{
              background: "#ffffff",
              border: "1px solid var(--line)",
              color: "var(--ink)",
            }}
          />
        )}

        {/* 우측 버튼 — morph */}
        {recording === "recording" ? (
          <button
            onClick={stopRecording}
            className="p-3 rounded-2xl active:opacity-90 flex-shrink-0"
            style={{
              background: "var(--danger)",
              color: "#fff",
              boxShadow: "0 4px 12px rgba(208, 69, 69, 0.30)",
            }}
            aria-label="녹음 정지"
          >
            <Square className="w-5 h-5" />
          </button>
        ) : recording === "transcribing" ? (
          <button
            disabled
            className="p-3 rounded-2xl flex-shrink-0 disabled:cursor-not-allowed"
            style={{
              background: "var(--bg-soft)",
              color: "var(--ink-soft)",
              opacity: 0.75,
            }}
            aria-label="음성 변환 중"
          >
            <Loader2 className="w-5 h-5 animate-spin" />
          </button>
        ) : input.trim() ? (
          <button
            onClick={() => void sendMessage()}
            disabled={loading}
            className="p-3 rounded-2xl active:opacity-90 flex-shrink-0 disabled:cursor-not-allowed"
            style={{
              background: "var(--primary)",
              color: "#ffffff",
              boxShadow: "0 4px 12px rgba(47, 109, 79, 0.25)",
              opacity: loading ? 0.6 : 1,
            }}
            aria-label="보내기"
          >
            <Send className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={() => void startRecording()}
            disabled={loading}
            className="p-3 rounded-2xl active:opacity-90 flex-shrink-0 disabled:cursor-not-allowed"
            style={{
              background: "var(--primary)",
              color: "#ffffff",
              boxShadow: "0 4px 12px rgba(47, 109, 79, 0.25)",
              opacity: loading ? 0.6 : 1,
            }}
            aria-label="말로 입력하기"
          >
            <Mic className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
