"use client";

/**
 * todo 카드 누르면 뜨는 사진 가이드 팝업 — 정보 안내 전용.
 *
 * CTA 없음. 사용자가 안내만 보고 ✕ 또는 배경 클릭으로 닫음.
 * 실제 사진은 홈 화면의 음성/직접입력/사진 버튼에서 진행.
 *
 * 홈 화면 룩앤필 — floating card + 진초록 액센트 + 둥근 모서리(2rem) 강조.
 */

import { Check, X } from "lucide-react";
import { getTodoPhotoGuide } from "@/lib/todo-photo-guide";
import type { TodoItemApi } from "@/lib/todo-service";

interface TodoPhotoGuideModalProps {
  open: boolean;
  todo: TodoItemApi | null;
  onClose: () => void;
}

export default function TodoPhotoGuideModal({
  open,
  todo,
  onClose,
}: TodoPhotoGuideModalProps) {
  if (!open || !todo) return null;

  const fallback = todo.job_name || todo.activity_name || "작업";
  const guide = getTodoPhotoGuide(todo.job_cd, fallback);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in px-4 py-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm flex flex-col overflow-hidden"
        style={{
          background: "#ffffff",
          borderRadius: 32,
          boxShadow: "0 12px 40px rgba(31, 42, 31, 0.22), 0 4px 12px rgba(31, 42, 31, 0.12)",
          maxHeight: "min(85vh, 720px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 — 작업명 + 닫기 */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-3 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold mb-1" style={{ color: "var(--primary)" }}>
              이런 사진을 찍어주세요
            </p>
            <h2 className="text-2xl font-extrabold break-keep" style={{ color: "var(--ink)" }}>
              {guide.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-full p-2 active:opacity-70"
            style={{ background: "var(--bg-soft)", color: "var(--ink-soft)" }}
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 — 길이 길면 내부 스크롤 */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* sample placeholder — 둥근 박스 (rounded 2rem) */}
          <div
            className="w-full flex items-center justify-center"
            style={{
              background: guide.sampleBackground,
              aspectRatio: "16/7",
              borderRadius: 24,
            }}
          >
            <span className="text-6xl" style={{ filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15))" }}>
              {guide.sampleEmoji}
            </span>
          </div>
          <p className="text-xs font-bold text-center mt-1.5" style={{ color: "var(--muted)" }}>
            예시 이미지
          </p>

          {/* 한 줄 설명 */}
          <p
            className="mt-4 text-sm font-bold leading-relaxed break-keep"
            style={{ color: "var(--ink-soft)" }}
          >
            {guide.description}
          </p>

          {/* 체크포인트 — 둥근 알약 row (홈 todo row 톤) */}
          <div className="mt-4">
            <p className="text-xs font-bold mb-2" style={{ color: "var(--muted)" }}>
              꼭 보여야 하는 것
            </p>
            <ul className="flex flex-col gap-2">
              {guide.checkpoints.map((cp, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2.5 px-4 py-2.5"
                  style={{
                    background: "var(--bg-soft)",
                    border: "1px solid var(--line-soft)",
                    borderRadius: 20,
                  }}
                >
                  <div
                    className="flex-shrink-0 rounded-full p-1"
                    style={{ background: "var(--accent-soft)" }}
                  >
                    <Check className="w-3 h-3" style={{ color: "var(--primary)" }} strokeWidth={3} />
                  </div>
                  <span className="text-sm font-bold flex-1" style={{ color: "var(--ink)" }}>
                    {cp}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
