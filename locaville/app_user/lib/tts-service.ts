"use client";

/** 한국어 음성 안내 — 2-tier:
 *
 *  - speak()           : Web Speech API (`speechSynthesis`). 무료, 즉시.
 *  - prefetchChirp()   : Google Chirp 3 HD Kore 를 미리 합성해 mp3 blob URL 캐시.
 *  - speakChirpIfCached: 캐시 hit 면 Chirp mp3 즉시 재생, miss 면 false.
 *
 *  PhotoLiveCoachOverlay 는 정적 안내(흔들림/어둠)를 mount 시 prefetch 해두면
 *  첫 발화부터 Chirp 로 0 ms 재생. LLM 동적 안내는 캐시 miss → speak() 폴백 후
 *  백그라운드 prefetch → 다음 같은 메시지부터 Chirp.
 *
 *  사용 예:
 *    speak("논으로 나가주세요");
 *    void prefetchChirp("잠깐 멈추고 비춰 주세요");
 *    if (!speakChirpIfCached(msg)) speak(msg);
 *    stopAllSpeech();
 */

import { requestOpenAiTts } from "@/lib/ai-service";

export type SpeakOptions = {
  /** 0.1 ~ 10, 기본 1. 고령 사용자에겐 0.9~0.95 권장 (살짝 천천히). */
  rate?: number;
  /** 0 ~ 1, 기본 1 */
  volume?: number;
  /** 한국어 우선. 없으면 디바이스 default. */
  lang?: string;
};

// ── Web Speech API (브라우저 내장) ──
let lastUtterance: SpeechSynthesisUtterance | null = null;

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, opts?: SpeakOptions): void {
  if (!ttsSupported() || !text.trim()) return;
  try {
    // 이전 발화 취소 — 메시지가 빠르게 바뀔 때 겹치지 않게.
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = opts?.lang || "ko-KR";
    utter.rate = opts?.rate ?? 0.95;
    utter.volume = opts?.volume ?? 1;
    lastUtterance = utter;
    window.speechSynthesis.speak(utter);
  } catch {
    // ignore
  }
}

export function stopSpeak(): void {
  if (!ttsSupported()) return;
  try {
    window.speechSynthesis.cancel();
    lastUtterance = null;
  } catch {
    // ignore
  }
}

// ── Google Chirp 3 HD Kore (backend `/ai/tts` 경유) — 캐시 ──
// text → object URL. 모듈 레벨이라 페이지 살아있는 동안 유지.
const CHIRP_CACHE = new Map<string, string>();
const CHIRP_INFLIGHT = new Map<string, Promise<void>>();
let currentChirpAudio: HTMLAudioElement | null = null;

/** 한 문장을 미리 합성해 mp3 blob URL 캐시. 이미 캐시/요청중이면 skip. */
export async function prefetchChirp(text: string): Promise<void> {
  const key = text.trim();
  if (!key || CHIRP_CACHE.has(key)) return;
  if (CHIRP_INFLIGHT.has(key)) return CHIRP_INFLIGHT.get(key);
  const p = (async () => {
    try {
      const tts = await requestOpenAiTts(key);
      const url = tts?.audio_url || "";
      if (url) CHIRP_CACHE.set(key, url);
    } catch {
      // 실패는 silent — caller 가 speak() 폴백.
    } finally {
      CHIRP_INFLIGHT.delete(key);
    }
  })();
  CHIRP_INFLIGHT.set(key, p);
  return p;
}

/** 캐시 hit 면 Chirp mp3 즉시 재생 후 true. miss 면 false. */
export function speakChirpIfCached(text: string): boolean {
  const key = text.trim();
  if (!key) return false;
  const url = CHIRP_CACHE.get(key);
  if (!url) return false;
  stopAllSpeech();
  try {
    const audio = new Audio(url);
    currentChirpAudio = audio;
    void audio.play().catch(() => {
      // 자동 재생 정책으로 막히면 Web Speech 폴백.
      speak(text);
    });
    return true;
  } catch {
    return false;
  }
}

/** Web Speech + Chirp 둘 다 정지. */
export function stopAllSpeech(): void {
  if (ttsSupported()) {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
  if (currentChirpAudio) {
    try {
      currentChirpAudio.pause();
      currentChirpAudio.currentTime = 0;
    } catch { /* ignore */ }
    currentChirpAudio = null;
  }
}
