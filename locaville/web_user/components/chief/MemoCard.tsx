"use client";

/**
 * 오늘 마을 메모 — 우측 사이드의 상단 카드 (lvb-memo).
 * AI 추천 텍스트 + "들어보기" TTS 토글.
 */

import { useCallback, useState } from "react";
import { Sun, Volume2 } from "lucide-react";

/** 메모 텍스트를 문장 단위로 분리 — "한 문장씩 줄 바꿈" 표시에 사용.
 *  문장 끝 부호(. ! ?)까지를 한 문장으로 묶는다. 끝 부호 없는 마지막 조각도 유지.
 *  (lookbehind 정규식은 구형 Safari 에서 깨질 수 있어 match 방식으로 호환성 확보.) */
export function splitSentences(text: string): string[] {
  const parts = (text || "").match(/[^.!?]+[.!?]*/g) || [];
  return parts.map((s) => s.trim()).filter(Boolean);
}

export default function MemoCard({
  memo,
  onPlay,
}: {
  memo: string;
  onPlay?: () => void;
}) {
  const [playing, setPlaying] = useState(false);

  const handlePlay = useCallback(() => {
    if (onPlay) {
      onPlay();
      return;
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(memo);
    u.lang = "ko-KR";
    u.rate = 0.95;
    u.onend = () => setPlaying(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setPlaying(true);
  }, [memo, onPlay, playing]);

  return (
    <div className="lvb-memo">
      <div className="lvb-memo-head">
        <span className="lvb-memo-ic"><Sun size={16} /></span>
        <span className="lvb-memo-title">오늘 마을 메모</span>
        <button
          type="button"
          className={`lvb-memo-play${playing ? " is-on" : ""}`}
          onClick={handlePlay}
        >
          <Volume2 size={14} />
          {playing ? "그만 듣기" : "들어보기"}
        </button>
      </div>
      <div className="lvb-memo-body">
        {splitSentences(memo).map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </div>
    </div>
  );
}
