"use client"

/**
 * v0_chief 도움말 RAG 챗봇 — 우하단 floating panel 안에서 렌더되는 chat thread.
 *
 * v0_farmer HelpScreen 과 같은 backend endpoint (`POST /ai/chat`) 사용 — 시행문서 RAG.
 * 이장님용 FAQ 톤 (단가/이행/참여 취소 등 행정·제도 질문).
 */
import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { Bot, Send } from "lucide-react"

import { askHelpStream } from "@/lib/admin-api"

type Message = { id: number; role: "user" | "bot"; text: string }

const QUICK_QUESTIONS = [
  "저탄소농업 시범사업 지급 단가는?",
  "이행 점검 시 어떤 증빙을 확인하나요?",
  "농가가 사업 참여를 취소하면?",
] as const

const FALLBACK_ANSWER =
  "입력하신 내용을 기준으로 일반 안내를 드릴게요. 정확한 내용은 시행문서를 함께 확인해 주세요."

function TypingIndicator() {
  return (
    <div className="flex items-center" style={{ gap: 6 }} aria-label="AI 작성 중">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--lvb-accent, #2f6d4f)",
            animation: "help-typing-bounce 1s infinite ease-in-out",
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </div>
  )
}

export function HelpChat() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "bot", text: "이장님, 안녕하세요. 사업·증빙·정산 등 궁금한 점을 편하게 물어보세요." },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevLen = useRef(messages.length)

  useEffect(() => {
    if (messages.length > prevLen.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
    prevLen.current = messages.length
  }, [messages])

  async function askWithAi(text: string) {
    if (!text || loading) return
    const stamp = Date.now()
    const userMsg: Message = { id: stamp, role: "user", text }
    const botPlaceholderId = stamp + 1

    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    const threadForApi = [...messages, userMsg]
      .slice(-12)
      .map((m) => ({ role: (m.role === "bot" ? "assistant" : "user") as "user" | "assistant", content: m.text }))
      .filter((m) => m.content.trim())

    // OpenAI Responses API 가 토큰을 큰 chunk 로 한꺼번에 보내서 진짜 점진 출력이 안 됨.
    // → typewriter pattern: 도착하는 토큰을 buffer 에 모으고, 별도 interval 이 글자 단위로
    //   빼서 화면에 표시. backend 가 빨라도 화면은 부드러운 점진 출력처럼 보임.
    let bufferText = ""       // 도착한 토큰 누적 (final 받으면 final 로 교체)
    let displayedLen = 0      // 화면에 보여진 글자 수
    let botAdded = false
    let streamDone = false
    let timer: ReturnType<typeof setInterval> | null = null

    function tick() {
      if (displayedLen < bufferText.length) {
        // 한 번에 더 빼면 더 빠른 출력. 1 글자 = 부드러움, 2-3 글자 = 빠름.
        displayedLen = Math.min(displayedLen + 1, bufferText.length)
        const slice = bufferText.slice(0, displayedLen)
        if (!botAdded) {
          botAdded = true
          flushSync(() => {
            setLoading(false)
            setMessages((prev) => [...prev, { id: botPlaceholderId, role: "bot", text: slice }])
          })
        } else {
          flushSync(() => {
            setMessages((prev) =>
              prev.map((m) => (m.id === botPlaceholderId ? { ...m, text: slice } : m)),
            )
          })
        }
      } else if (streamDone && timer) {
        clearInterval(timer)
        timer = null
      }
    }

    function startTypewriter() {
      if (timer) return
      timer = setInterval(tick, 28)  // ~36자/초 — ChatGPT 와 비슷한 차분한 속도
    }

    await askHelpStream(threadForApi, {
      onToken: (delta) => {
        bufferText += delta
        startTypewriter()
      },
      onFinal: (resp) => {
        // 후처리된 final 로 buffer 교체 — typewriter 가 이어서 final 까지 출력
        if (resp.answer?.trim()) bufferText = resp.answer.trim()
      },
      onError: (detail) => {
        if (!botAdded && !bufferText) {
          bufferText = `도움말 서버 오류: ${detail}`
          startTypewriter()
        }
      },
    })

    streamDone = true
    // typewriter 가 따라잡을 때까지 짧게 대기 (UI 완성 보장)
    while (timer) {
      await new Promise((r) => setTimeout(r, 30))
    }
    if (!botAdded) {
      setMessages((prev) => [...prev, { id: botPlaceholderId, role: "bot", text: FALLBACK_ANSWER }])
    }
    setLoading(false)
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    setInput("")
    await askWithAi(text)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <style jsx global>{`
        @keyframes help-typing-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>

      {/* Chat thread */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minHeight: 0,
        }}
      >
        {/* FAQ 카드 (첫 진입 시만) */}
        {messages.length === 1 && (
          <div style={{ marginTop: 4 }}>
            <p style={{ fontSize: 14, fontWeight: 800, margin: "0 0 10px", color: "var(--lvb-muted, #5e6356)" }}>
              자주 묻는 질문
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void askWithAi(q)}
                  disabled={loading}
                  style={{
                    background: "var(--lvb-card, #ffffff)",
                    border: "1.5px solid var(--lvb-line, #e8e1ce)",
                    borderRadius: 12,
                    padding: "14px 16px",
                    textAlign: "left",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--lvb-ink, #1f2a1f)",
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 9,
              flexDirection: msg.role === "user" ? "row-reverse" : "row",
            }}
          >
            {msg.role === "bot" && (
              <div
                style={{
                  flexShrink: 0,
                  background: "var(--lvb-accent, #2f6d4f)",
                  borderRadius: "50%",
                  padding: 8,
                  alignSelf: "flex-start",
                }}
              >
                <Bot size={20} color="#fff" />
              </div>
            )}
            <div
              style={
                msg.role === "user"
                  ? {
                      maxWidth: "80%",
                      padding: "13px 17px",
                      background: "var(--lvb-accent, #2f6d4f)",
                      color: "#fff",
                      borderRadius: 14,
                      borderBottomRightRadius: 4,
                      boxShadow: "0 2px 6px rgba(47, 109, 79, 0.18)",
                      fontSize: 17,
                      fontWeight: 600,
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                    }
                  : {
                      maxWidth: "80%",
                      padding: "13px 17px",
                      background: "var(--lvb-bg-soft, #f3efe4)",
                      border: "1px solid var(--lvb-line, #e8e1ce)",
                      color: "var(--lvb-ink, #1f2a1f)",
                      borderRadius: 14,
                      borderBottomLeftRadius: 4,
                      fontSize: 17,
                      fontWeight: 600,
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                    }
              }
            >
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 9 }}>
            <div style={{ flexShrink: 0, background: "var(--lvb-accent, #2f6d4f)", borderRadius: "50%", padding: 8 }}>
              <Bot size={20} color="#fff" />
            </div>
            <div
              style={{
                padding: "14px 18px",
                background: "var(--lvb-bg-soft, #f3efe4)",
                border: "1px solid var(--lvb-line, #e8e1ce)",
                borderRadius: 14,
                borderBottomLeftRadius: 4,
              }}
            >
              <TypingIndicator />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div
        style={{
          borderTop: "1px solid var(--lvb-line, #e8e1ce)",
          padding: 14,
          display: "flex",
          gap: 9,
          background: "#fff",
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void handleSend()
            }
          }}
          disabled={loading}
          placeholder="질문을 입력해 보세요"
          style={{
            flex: 1,
            padding: "14px 18px",
            fontSize: 17,
            fontWeight: 600,
            borderRadius: 12,
            border: "1.5px solid var(--lvb-line-2, #d8cfb6)",
            background: "#fff",
            color: "var(--lvb-ink, #1f2a1f)",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={loading || !input.trim()}
          aria-label="보내기"
          style={{
            padding: "14px 18px",
            background: "var(--lvb-accent, #2f6d4f)",
            color: "#fff",
            borderRadius: 12,
            border: "none",
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            opacity: loading || !input.trim() ? 0.6 : 1,
            display: "flex",
            alignItems: "center",
            boxShadow: "0 3px 10px rgba(47, 109, 79, 0.28)",
          }}
        >
          <Send size={22} />
        </button>
      </div>
    </div>
  )
}
