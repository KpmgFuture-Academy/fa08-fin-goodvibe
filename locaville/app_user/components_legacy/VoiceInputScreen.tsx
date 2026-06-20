"use client";

/**
 * 음성 입력 영농일지 작성 화면 (카카오톡 스타일 자동 대화).
 *
 * 흐름:
 *   1) 화면 진입 → bootstrapSession (backend `/ai/voice/session/start`)
 *   2) 어시스턴트 질문 TTS 재생 + 동시에 STT(interimResults) 켜둠 — barge-in 지원
 *   3) 사용자가 말 시작 → TTS 중단(음성 응답 가능), STT interim → 최종 transcript
 *   4) 최종 transcript → `/ai/voice/session/reply` → 새 질문 → 2 반복
 *   5) status === "ready_to_confirm" 이면 저장 카드 노출, 자동 듣기 중단
 *
 * 마이크 버튼 없음 — 항상 듣고 있다. 저장 카드의 "저장하기" 버튼만 명시적 액션.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import CompletionModal from "./CompletionModal";
import {
  finalizeVoiceSession,
  replyVoiceSession,
  requestOpenAiStt,
  requestOpenAiTts,
  startVoiceSession,
  type VoiceSessionStateResponse,
} from "@/lib/ai-service";
import { saveManualDiaryRecord } from "@/lib/diary-service";
import type { DiaryRecord, InputMethod, ManualDiaryInput } from "@/lib/diary-types";
import { useHelperMode } from "@/lib/helper-mode-context";
import type { TodoItemApi } from "@/lib/todo-service";

type Screen =
  | "home"
  | "voiceInput"
  | "manualInput"
  | "photoInput"
  | "saveComplete"
  | "journal"
  | "business"
  | "help"
  | "settings"
  | "journalDetail"
  | "businessDetail"
  | "splash"
  | "loginSelect"
  | "manualLogin";

interface SavedRecord {
  date: string;
  work: string;
  field: string;
  amount: string;
  business: string;
  hasPhoto: boolean;
  memo?: string;
  inputMethod: InputMethod;
}

interface VoiceInputScreenProps {
  navigate: (screen: Screen) => void;
  setSavedRecord: (r: SavedRecord) => void;
  setInputMethod: (m: InputMethod) => void;
  onDiarySaved?: (input: ManualDiaryInput, record: DiaryRecord) => void | Promise<void>;
  selectedTodo?: TodoItemApi | null;
}

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  source?: "ai" | "heuristic";
};

// OpenAI Whisper(/ai/stt) 사용을 위한 mic 권한·MediaRecorder 가용성 체크.
function canUseMicRecording() {
  if (typeof window === "undefined") return false;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  if (typeof MediaRecorder === "undefined") return false;
  return true;
}

// MediaRecorder 가 지원하는 가장 OpenAI 친화 mime. webm/opus 가 가장 광범위.
function pickRecorderMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  for (const m of candidates) {
    try {
      if ((MediaRecorder as unknown as { isTypeSupported?: (t: string) => boolean }).isTypeSupported?.(m)) {
        return m;
      }
    } catch {
      // ignore
    }
  }
  return "audio/webm";
}

function browserSpeak(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = 1.0;
  if (onEnd) utterance.onend = () => onEnd();
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function randomId() {
  return `m_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

export default function VoiceInputScreen({
  navigate,
  setSavedRecord,
  setInputMethod,
  onDiarySaved,
  selectedTodo = null,
}: VoiceInputScreenProps) {
  const { effectiveFarmerId } = useHelperMode();
  const supportsSpeech = useMemo(canUseMicRecording, []);

  // ── 대화 상태 ──
  // "asking"      : 정보 모으는 단계 (백엔드 슬롯 채우기 Q&A)
  // "asking_photo": 일지 저장 완료, "사진도 찍으시겠어요?" 묻는 단계
  // "done"        : 답변 받고 사진 찍거나 완료 모달 띄울 준비
  const [sessionId, setSessionId] = useState("");
  const [stageStatus, setStageStatus] = useState<"asking" | "asking_photo" | "done">("asking");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [voiceState, setVoiceState] = useState<"idle" | "speaking" | "listening" | "thinking">("idle");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fallbackNotice, setFallbackNotice] = useState("");
  const [completedRecord, setCompletedRecord] = useState<DiaryRecord | null>(null);
  // 0~1. listening 시 사용자 음성 RMS, speaking 시 부드러운 sine pulse, 그 외 0.
  // VoiceOrb 의 scale/glow 강도에 매핑.
  const [amplitude, setAmplitude] = useState(0);

  // ── refs — 비동기 흐름 제어 ──
  const sessionIdRef = useRef("");
  const stageStatusRef = useRef<"asking" | "asking_photo" | "done">("asking");
  // MediaRecorder + Silero VAD (WASM) 관련.
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // MicVAD 인스턴스 — Silero VAD WASM. 음성/노이즈 신경망 판정으로 바스락 같은 비음성에 강함.
  // 동적 import (브라우저에서만, SSR 회피).
  const micVadRef = useRef<{
    start: () => void;
    pause: () => void;
    destroy: () => void;
  } | null>(null);
  const noSpeechTimeoutRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingRef = useRef(false);
  // VAD 가 발화 시작 감지 → true. 종료 시 false 면 STT 호출 skip.
  const userSpokeRef = useRef(false);
  const onFinalRef = useRef<((text: string) => void) | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  // 사전 캐시된 "잠시만요" TTS 파일 URL — thinking 상태 가시화용 짧은 필러.
  const fillerAudioUrlRef = useRef<string>("");
  // Whisper 가 연속으로 빈 문자열을 돌려준 횟수 — 2회째에 친절 안내 재생.
  const consecutiveEmptyRef = useRef<number>(0);
  // 현재 한 사이클(질문→사용자 답변→submit)이 끝났는지 추적해서 중복 submit 방지.
  const submittedThisCycleRef = useRef(false);
  // 컴포넌트 unmount 후에 비동기 콜백이 setState 안 하도록.
  const mountedRef = useRef(true);
  // Next.js dev (React Strict Mode) 에서 useEffect 가 2번 실행돼 bootstrap 이 두 번 돌면
  // 첫 질문 말풍선/TTS 가 두 번 뜨는 문제 방지. production 에선 영향 없음.
  const didBootstrapRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releaseMic();
      stopTts();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    stageStatusRef.current = stageStatus;
  }, [stageStatus]);

  // ── orb amplitude tracking ──
  // listening: analyser 의 RMS (사용자 음성 크기) → 0~1
  // speaking : TTS 출력은 캡쳐 안 되니 부드러운 sine pulse 로 대체 (말하는 느낌만 표현)
  // 그 외   : 0 으로 수렴
  useEffect(() => {
    if (voiceState !== "listening" && voiceState !== "speaking") {
      setAmplitude(0);
      return;
    }
    let rafId = 0;
    if (voiceState === "listening") {
      const analyser = analyserRef.current;
      if (!analyser) return;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!mountedRef.current) return;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        // lerp 으로 부드럽게 + 3 배 게인 (보통 RMS 가 작음).
        setAmplitude((prev) => prev * 0.7 + Math.min(rms * 3, 1) * 0.3);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    } else {
      // speaking: 시간 기반 인공 pulse — 사용자에게 "AI 가 말하는 중" 느낌
      const start = performance.now();
      const tick = () => {
        if (!mountedRef.current) return;
        const t = (performance.now() - start) / 450;
        setAmplitude(0.35 + Math.abs(Math.sin(t)) * 0.35);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(rafId);
  }, [voiceState]);

  useEffect(() => {
    // chat thread 내부의 가까운 scroll container 만 이동시킴.
    // block: "nearest" 없으면 부모 page-level container 까지 같이 스크롤되어
    // 화면 진입 시 전체 페이지가 아래로 내려가는 부작용 발생.
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, voiceState]);

  // 컴포넌트 진입 직후 한 번, "잠시만요" TTS 를 백엔드에서 받아 캐시.
  // 실제 thinking 상태에서 사용되는 짧은 필러. 실패해도 본 흐름엔 영향 없음.
  useEffect(() => {
    void (async () => {
      const tts = await requestOpenAiTts("잠시만요.", "alloy");
      if (!mountedRef.current) return;
      if (tts?.audio_url) {
        fillerAudioUrlRef.current = tts.audio_url;
      }
    })();
  }, []);

  // ── TTS 제어 ──
  const stopTts = useCallback(() => {
    if (ttsAudioRef.current) {
      try {
        ttsAudioRef.current.pause();
        ttsAudioRef.current.currentTime = 0;
      } catch {
        // ignore
      }
      ttsAudioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // playQuestion: TTS 재생을 시작하고 onEnd 콜백을 보장.
  // OpenAI TTS 실패 시 브라우저 speechSynthesis 폴백.
  const playQuestion = useCallback(async (text: string, onEnd: () => void) => {
    stopTts();
    if (!text) {
      onEnd();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onEnd();
    };
    try {
      const tts = await requestOpenAiTts(text, "alloy");
      if (!mountedRef.current) return;
      if (tts?.audio_url) {
        const audio = new Audio(tts.audio_url);
        ttsAudioRef.current = audio;
        audio.onended = finish;
        audio.onerror = finish;
        // 사용자 제스처(컴포넌트 진입 + 어디든 클릭) 없으면 autoplay 막힐 수 있음.
        // 실패 시 폴백.
        audio.play().catch(() => {
          browserSpeak(text, finish);
        });
        return;
      }
    } catch {
      // ignore
    }
    browserSpeak(text, finish);
  }, [stopTts]);

  // ── STT 제어 — OpenAI Whisper (`/ai/stt`) + 자체 VAD ──
  //
  // 흐름:
  //   1) 마이크 스트림 한 번만 열고 컴포넌트 라이프사이클 동안 재사용.
  //   2) 50ms 마다 AnalyserNode 로 RMS 측정 → 음성/침묵 프레임 카운트.
  //   3) 음성 프레임 ≥ START_FRAMES → MediaRecorder 시작 + TTS 즉시 중단(barge-in).
  //   4) 침묵 프레임 ≥ END_FRAMES → MediaRecorder.stop() → blob → POST /ai/stt.
  //   5) 응답 text → onFinal 콜백. 빈 결과면 다시 듣기.
  // VAD_THRESHOLD 는 calibrateNoise() 가 동적으로 vadThresholdRef.current 에 채움.
  // baseline*4 또는 최소 0.02. 캘리브레이션 전 기본값 0.025.
  const VAD_INTERVAL_MS = 50;
  // 150ms 이상 연속 음성일 때 녹음 시작 — TTS-STT 가 분리됐으니(barge-in 제거) 짧게 잡아도 안전.
  // 발화 앞부분(예: '삼번') 손실을 최소화한다.
  const VAD_START_FRAMES = 3;
  const VAD_END_FRAMES = 24; // 약 1.2s 침묵 → 발화 종료로 판정.
  const VAD_MAX_FRAMES = 240; // 12초 안전 상한 — 너무 길면 강제 종료.
  // 녹음된 오디오 blob 이 이보다 작으면 잡음만으로 판단해 Whisper 호출 스킵.
  // webm/opus 기준 ~3KB 이하면 보통 의미 있는 발화가 아님.
  const MIN_AUDIO_BYTES = 3000;

  const stopRecognition = useCallback(() => {
    onFinalRef.current = null;
    recordingRef.current = false;
    if (noSpeechTimeoutRef.current != null) {
      window.clearInterval(noSpeechTimeoutRef.current);
      noSpeechTimeoutRef.current = null;
    }
    // VAD 일시정지 — destroy 는 cleanup 시에만 (다음 startRecognition 에서 재사용).
    try {
      micVadRef.current?.pause();
    } catch {
      // ignore
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        // dataavailable 이후 onstop 이 호출되는데, 우리는 그 결과를 무시해야 하므로
        // 핸들러를 모두 떼고 stop. 이미 폐기된 onstop 은 빈 chunks 만 보고 종료.
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.stop();
      } catch {
        // ignore
      }
    }
    recordedChunksRef.current = [];
  }, []);

  // 마이크 스트림을 처음 한 번만 열고 AudioContext+AnalyserNode 를 셋업.
  // 컴포넌트 살아있는 동안 재사용. unmount 시 releaseMic 으로 정리.
  const ensureMic = useCallback(async (): Promise<boolean> => {
    if (micStreamRef.current && audioCtxRef.current && analyserRef.current) return true;
    if (!canUseMicRecording()) {
      setErrorMessage("이 기기에서는 마이크 녹음을 지원하지 않습니다.");
      return false;
    }
    try {
      // 안전한 default 오디오 제약 — 브라우저가 거부 가능한 strict 값(sampleRate 16000 등) 피함.
      // EC/NS/AGC 켜둠 — 한국어 정확도 약간 손해 보더라도 음성이 안정적으로 잡힘.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      micStreamRef.current = stream;
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtor();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Silero VAD (WASM 신경망) 셋업 — 옛 RMS 음량 VAD 대신.
      // 동적 import 라 SSR 빌드에 영향 없음. wasm/onnx 정적 파일은 /public/vad/ 에 있다.
      try {
        const { MicVAD } = await import("@ricky0123/vad-web")
        // getStream 으로 우리 micStreamRef 를 재사용 — 마이크 1번만 열림.
        // audioContext 도 기존 컨텍스트 공유. baseAssetPath/onnxWASMBasePath 는 public/vad/.
        const vad = await MicVAD.new({
          model: "v5",
          baseAssetPath: "/vad/",
          onnxWASMBasePath: "/vad/",
          audioContext: audioCtx,
          getStream: async () => stream,
          pauseStream: async () => undefined,
          resumeStream: async (s) => s,
          // 음성/비음성 판정 임계 — 기본값 사용. 환경별 튜닝은 데이터 보고 조정.
          positiveSpeechThreshold: 0.5,
          negativeSpeechThreshold: 0.35,
          minSpeechMs: 100,  // 100ms 이상 음성으로 인식돼야 발화 처리 (짧은 잡음 차단)
          onSpeechStart: () => {
            userSpokeRef.current = true
          },
          onSpeechEnd: () => {
            // 발화 종료 — 녹음 즉시 종료해 STT 호출 트리거.
            const recorder = recorderRef.current
            if (recorder && recorder.state !== "inactive") {
              try {
                recorder.stop()
              } catch {
                // ignore
              }
            }
          },
          // 음성으로 의심됐다가 실제로는 짧은 잡음 → 발화 처리 안 함.
          onVADMisfire: () => {
            // 아무 동작 X — 녹음은 계속 진행되다 NO_SPEECH_TIMEOUT 또는 종료 신호로 정리.
          },
        })
        micVadRef.current = vad as unknown as { start: () => void; pause: () => void; destroy: () => void }
      } catch (e) {
        // VAD 로드 실패 — 마이크는 그대로 동작. 음성 감지 없이 timeout 기반 종료만.
        // (raw stream + STT 만으로도 동작은 함, 단 잡음에 약함)
        console.warn("[VoiceInputScreen] MicVAD 초기화 실패:", e)
      }

      return true;
    } catch {
      setErrorMessage(
        "마이크 권한이 필요해요. 브라우저 주소창의 자물쇠를 눌러 권한을 허용해 주세요.",
      );
      return false;
    }
  }, []);

  const releaseMic = useCallback(() => {
    stopRecognition();
    // VAD 완전 정리 (모델 메모리 해제)
    const vad = micVadRef.current;
    micVadRef.current = null;
    if (vad) {
      try {
        vad.destroy();
      } catch {
        // ignore
      }
    }
    const stream = micStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    micStreamRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    analyserRef.current = null;
    if (ctx) {
      void ctx.close().catch(() => undefined);
    }
  }, [stopRecognition]);

  // (옛 RMS 임계치 calibrateNoise 제거 — Silero VAD 가 자체 음성/노이즈 판정)

  // 한 발화를 녹음 → /ai/stt 로 보내 transcript 받아 onFinal 호출. 빈 결과면 재시도.
  const startRecognition = useCallback(
    async (onFinal: (text: string) => void) => {
      if (!mountedRef.current) return;
      stopRecognition();
      onFinalRef.current = onFinal;

      const ok = await ensureMic();
      if (!ok || !micStreamRef.current) return;
      // AudioContext 가 suspended 면 resume (autoplay 정책).
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          // ignore
        }
      }
      if (!mountedRef.current || stageStatusRef.current === "done") return;

      const stream = micStreamRef.current;
      recordedChunksRef.current = [];

      const handleTranscript = async () => {
        const chunks = recordedChunksRef.current;
        recordedChunksRef.current = [];
        recordingRef.current = false;
        if (noSpeechTimeoutRef.current != null) {
          window.clearInterval(noSpeechTimeoutRef.current);
          noSpeechTimeoutRef.current = null;
        }
        // VAD 가 신경망으로 음성 1건도 감지 못한 채 종료 → 무음/잡음만 녹음됨. Whisper 호출 스킵.
        if (!userSpokeRef.current) {
          if (mountedRef.current && stageStatusRef.current !== "done") {
            void startRecognition(onFinal);
          }
          return;
        }
        if (!chunks.length) {
          // 녹음 실패 — 같은 질문에서 한 번 더 듣기.
          if (mountedRef.current && stageStatusRef.current !== "done") {
            void startRecognition(onFinal);
          }
          return;
        }
        const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
        // 너무 짧은 녹음(잡음·문 닫히는 소리 같은 짧은 transient)은 Whisper 호출 자체 스킵.
        // Whisper 가 짧은 무의미 오디오에서 인사말 환각을 자주 만들어내는 것을 사전 차단.
        if (blob.size < MIN_AUDIO_BYTES) {
          if (mountedRef.current && stageStatusRef.current !== "done") {
            void startRecognition(onFinal);
          }
          return;
        }
        const ext = blob.type.includes("mp4") ? ".mp4" : blob.type.includes("ogg") ? ".ogg" : ".webm";
        const file = new File([blob], `utt_${Date.now()}${ext}`, { type: blob.type });
        if (mountedRef.current) {
          setVoiceState("thinking");
          // "잠시만요" 짧은 필러 — 캐시된 OpenAI TTS 가 있으면 재생, 없으면 침묵 유지.
          // ttsAudioRef 에 끼워두면 다음 playQuestion 의 stopTts 가 자동 정리.
          const fillerUrl = fillerAudioUrlRef.current;
          if (fillerUrl) {
            try {
              stopTts();
              const audio = new Audio(fillerUrl);
              ttsAudioRef.current = audio;
              audio.play().catch(() => undefined);
            } catch {
              // ignore
            }
          }
        }
        const stt = await requestOpenAiStt(file);
        if (!mountedRef.current) return;
        const text = (stt?.text || "").trim();
        // ready_to_confirm 도중에 결과 들어오면 무시.
        if (stageStatusRef.current === "done") return;
        if (!text) {
          // 인식 실패 — 연속 2회째부터는 "다시 한 번 말씀해주세요" 친절 안내 후 재시도.
          consecutiveEmptyRef.current += 1;
          if (consecutiveEmptyRef.current >= 2) {
            consecutiveEmptyRef.current = 0;
            if (mountedRef.current) {
              setVoiceState("speaking");
              void playQuestion("잘 못 들었어요. 다시 한 번 말씀해주세요.", () => {
                if (mountedRef.current && stageStatusRef.current !== "done") {
                  void startRecognition(onFinal);
                }
              });
              return;
            }
          }
          void startRecognition(onFinal);
          return;
        }
        // 정상 인식 — 빈 결과 카운터 리셋.
        consecutiveEmptyRef.current = 0;
        const cb = onFinalRef.current;
        onFinalRef.current = null;
        cb?.(text);
      };

      // MediaRecorder 준비 — VAD 가 발화 감지하면 start, 침묵 감지하면 stop.
      const mime = pickRecorderMime();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: mime });
      } catch {
        try {
          recorder = new MediaRecorder(stream);
        } catch {
          setErrorMessage("녹음을 시작할 수 없어요. 마이크 권한을 확인해 주세요.");
          return;
        }
      }
      recorderRef.current = recorder;
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        // VAD 가 정상적으로 stop 을 부른 경우만 처리. stopRecognition 이 핸들러를 떼면 호출 안 됨.
        // userSpoke=false 면 handleTranscript 가 알아서 Whisper 호출 스킵.
        void handleTranscript();
      };

      // **listening 시작과 동시에 녹음 시작** — 발화 앞부분이 잘리지 않도록.
      // 음성 감지 (시작/종료) 는 Silero VAD (WASM) 가 담당. handleTranscript 가 STT 호출 시
      // userSpokeRef 로 발화 여부 확인.
      try {
        recorder.start(100); // 100ms 마다 dataavailable.
        recordingRef.current = true;
        userSpokeRef.current = false;
      } catch {
        setErrorMessage("녹음을 시작할 수 없어요. 마이크 권한을 확인해 주세요.");
        return;
      }
      if (mountedRef.current) setVoiceState("listening");

      // Silero VAD 시작 — onSpeechStart/End 콜백이 ensureMic 에서 설정됐고
      // recorder.stop() 을 자동 호출해 STT 트리거.
      try {
        micVadRef.current?.start();
      } catch {
        // VAD 시작 실패 — 절대 상한 타임아웃만으로 동작.
      }

      // 안전망 타임아웃들:
      //   1) NO_SPEECH_TIMEOUT (10초) — 발화 감지 0건이면 강제 종료, STT skip
      //   2) MAX_DURATION (15초) — 너무 길면 강제 종료해 STT 호출
      const NO_SPEECH_TIMEOUT_MS = 10000
      const MAX_DURATION_MS = 15000
      const startTime = Date.now()
      noSpeechTimeoutRef.current = window.setInterval(() => {
        if (!mountedRef.current) return;
        if (stageStatusRef.current === "done") {
          stopRecognition();
          return;
        }
        const elapsed = Date.now() - startTime
        const shouldStop =
          (!userSpokeRef.current && elapsed >= NO_SPEECH_TIMEOUT_MS) ||
          elapsed >= MAX_DURATION_MS
        if (shouldStop && recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            // ignore
          }
        }
      }, 500);
    },
    [ensureMic, playQuestion, stopRecognition, stopTts],
  );

  // 무의미한 짧은 응답("하", "하하", "어어", "음...", "..." 등) 또는 Whisper 환각 정형
  // 문장인지 판별. asking 단계에서만 사용(asking_photo 의 "응"/"네"는 정상 yes 응답이라 제외).
  //
  // Whisper 가 잡음(문 닫히는 소리·기침·키보드 등)에서 자주 환각하는 한국어 정형 문장:
  // YouTube 자막 / TV 뉴스 결말부 / 인사말에 학습 편향이 있어 무관 잡음을 이런 표현으로 채움.
  function isMeaninglessAsking(text: string): boolean {
    const raw = (text || "").trim();
    if (!raw) return true;

    // 끝 구두점 제거 후 정형/무관 응답 문장과 비교.
    const noPunct = raw.replace(/[\s\.\!\?…~,]+$/g, "");
    const HALLUCINATION_PHRASES = new Set([
      // 인사·맺음말 (잡음에서 가장 자주 나옴)
      "그렇습니다", "그렇습니다요",
      "감사합니다", "고맙습니다",
      "안녕하세요", "안녕하십니까", "안녕히 가세요",
      "수고하셨습니다", "수고하세요",
      "잘 모르겠습니다", "잘 모르겠어요", "잘 모르겠다",
      "맞습니다", "맞아요",
      "이상입니다", "끝났습니다", "끝.",
      "그래요",
      // 미디어 자막 잔재
      "MBC 뉴스", "KBS 뉴스", "SBS 뉴스",
      "구독과 좋아요", "구독, 좋아요 부탁드립니다",
      "다음 영상에서 만나요",
      "끝까지 봐주셔서 감사합니다",
      "시청해주셔서 감사합니다",
      // 발화 앞부분이 잘려 생긴 짧은 무관 응답 (작업 답변과 관계 없음)
      "이제는", "이제", "이제요",
      "글쎄요", "글쎄",
      "어떻게", "어떻게요", "어떡하지",
      "그게", "그게요", "그게 뭐였더라",
      "그러니까", "그래서",
      "뭐였더라", "뭐였지", "뭐지", "뭐죠",
      "잠시만요", "잠시만", "잠시",
      "기다려요", "기다려주세요",
      "잘 들렸어요", "잘 들었어요",
    ]);
    if (HALLUCINATION_PHRASES.has(noPunct)) return true;

    // 짧은 filler — 모든 공백/구두점 제거 후 길이/패턴 검사.
    const compact = raw.replace(/[\s\.\!\?…,~]/g, "");
    if (compact.length === 0) return true;
    const FILLERS = new Set(["하", "어", "음", "아", "에", "그", "응", "네", "예", "오", "이"]);
    if (compact.length === 1 && FILLERS.has(compact)) return true;
    // 같은 글자만 반복 — "하하", "어어어", "음음"
    if (/^(.)\1+$/.test(compact) && compact.length <= 3) return true;

    // 짧은 응답(3자 이하)인데 농업/작업 관련 키워드가 하나도 없으면 무의미 처리.
    // 예: "이제", "그건", "다음" 같이 블랙리스트에 누락된 표현도 자동으로 걸림.
    // "응"/"네" 같은 1자 yes 는 asking_photo 단계만 사용 → 여기는 영향 X.
    const FARMING_KEYWORDS = [
      "논", "밭", "필지", "구역",
      "비료", "농약", "방제", "바이오차", "수확", "모내기", "파종", "물",
      "포대", "자루", "되", "말",
      "벼", "고추", "콩", "마늘", "양파", "감자", "고구마",
      "오전", "오후", "아침", "저녁", "오늘", "어제",
      "했", "줬", "뿌렸", "뗐", "빼", "심", "거뒀", "갈", "묻",
    ];
    if (compact.length <= 3 && !FARMING_KEYWORDS.some((kw) => raw.includes(kw))) {
      return true;
    }
    return false;
  }

  // ── 한 사이클: 질문 발화 → 듣기 → 응답 수신 → 다음 질문 ──
  const askAndListen = useCallback(
    (question: string, source: "ai" | "heuristic" | undefined) => {
      submittedThisCycleRef.current = false;
      if (mountedRef.current) {
        setMessages((prev) => [
          ...prev,
          { id: randomId(), role: "assistant", text: question, source: source || "heuristic" },
        ]);
        setVoiceState("speaking");
      }

      const onFinal = async (userText: string) => {
        if (submittedThisCycleRef.current) return;

        // 무의미한 짧은 응답(예: "하…")이면 백엔드에 보내지 않고 다시 묻기.
        // 사용자 말풍선은 투명성을 위해 표시. submittedThisCycleRef 는 아직 안 막아서 재시도 가능.
        if (isMeaninglessAsking(userText)) {
          if (mountedRef.current) {
            setMessages((prev) => [...prev, { id: randomId(), role: "user", text: userText }]);
            setVoiceState("speaking");
          }
          const retryMsg = "잘 못 들었어요. 다시 한 번 말씀해주세요.";
          if (mountedRef.current) {
            setMessages((prev) => [...prev, { id: randomId(), role: "assistant", text: retryMsg }]);
          }
          // TTS 끝난 뒤에만 STT 시작 (정확도 우선).
          void playQuestion(retryMsg, () => {
            if (mountedRef.current && stageStatusRef.current === "asking") {
              setVoiceState("listening");
              void startRecognition(onFinal);
            }
          });
          return;
        }

        submittedThisCycleRef.current = true;
        if (mountedRef.current) {
          setMessages((prev) => [...prev, { id: randomId(), role: "user", text: userText }]);
          setVoiceState("thinking");
        }

        const sid = sessionIdRef.current;
        if (!sid) {
          // 세션 없으면 곧장 저장 + 사진 질문 단계로 (서버 미응답 폴백).
          if (mountedRef.current) {
            setDraft((prev) => ({ ...prev, work_detail: userText, confidence: "low" }));
            setFallbackNotice("연결이 불안정해 기본 모드로 진행합니다.");
            void handleReadyTransition();
          }
          return;
        }

        const reply = await replyVoiceSession({ session_id: sid, text: userText });
        if (!mountedRef.current) return;

        if (!reply) {
          setDraft((prev) => ({ ...prev, work_detail: userText, confidence: "low" }));
          setFallbackNotice("연결이 불안정해 기본 모드로 진행합니다.");
          void handleReadyTransition();
          setVoiceState("idle");
          return;
        }

        applySessionState(reply);
      };

      // TTS 가 완전히 끝난 뒤에만 STT 시작 — TTS 꼬리가 녹음에 섞이면
      // Whisper 정확도가 크게 떨어진다(혼합 오디오 → 환각). barge-in 보다 정확도 우선.
      const beginListening = () => {
        if (!mountedRef.current || stageStatusRef.current === "done") return;
        setVoiceState("listening");
        void startRecognition(onFinal);
      };
      void playQuestion(question, () => {
        if (mountedRef.current) beginListening();
      });
    },
    [playQuestion, startRecognition],
  );

  // ── 사용자 답변 yes/no 분류기 — 사진 찍기 질문 답변용 ──
  // 명확한 yes 면 "yes", 명확한 no 면 "no", 애매하면 "unclear".
  function classifyPhotoAnswer(text: string): "yes" | "no" | "unclear" {
    const t = (text || "").replace(/\s+/g, "").toLowerCase();
    if (!t) return "unclear";
    // 명시적 거절 패턴이 먼저 — "안 찍을게요" 같은 표현이 "찍" 매칭에 잡히지 않도록.
    const noPatterns = [
      /^아니/, /^괜찮/, /^됐/, /^싫/, /^안/, /^나중/, /패스/, /^그냥/, /^없/,
    ];
    for (const p of noPatterns) if (p.test(t)) return "no";
    const yesPatterns = [
      /^응/, /^어[그응네좋찍]/, /^네/, /^예/, /^좋/, /^그래/, /^할게/, /^할래/,
      /찍을/, /찍어/, /찍/, /부탁/,
    ];
    for (const p of yesPatterns) if (p.test(t)) return "yes";
    return "unclear";
  }

  // 사진 질문 단계 — 명확 답변 안 들어오면 1회까지 다시 묻고 그 다음엔 "no" 로 폴백.
  const photoAskAttemptsRef = useRef<number>(0);

  // 사진 단계 전용: 명백한 Whisper 환각/무의미 응답인지 판별.
  // "시청해주셔서 감사합니다" 같은 잡음 환각이 photo 단계에서도 자주 나옴 → 응답으로 카운트 X.
  function isHallucinatedPhotoAnswer(text: string): boolean {
    const cleaned = (text || "").trim().replace(/[\s\.\!\?…~,]+$/g, "");
    if (!cleaned) return true;
    const HALLUCINATIONS = new Set([
      "시청해주셔서 감사합니다",
      "끝까지 봐주셔서 감사합니다",
      "감사합니다", "고맙습니다",
      "안녕하세요", "안녕하십니까",
      "수고하셨습니다", "수고하세요",
      "구독과 좋아요", "구독, 좋아요 부탁드립니다",
      "MBC 뉴스", "KBS 뉴스", "SBS 뉴스",
      "다음 영상에서 만나요",
      "맞습니다", "이상입니다", "끝났습니다",
    ]);
    if (HALLUCINATIONS.has(cleaned)) return true;
    // 1글자 + filler 도 photo 단계에서 무의미 (asking 의 "응"/"네" 는 yes 라 OK)
    const compact = cleaned.replace(/[\s\.\!\?…,~]/g, "");
    if (compact.length === 1 && ["하", "어", "음", "아", "에", "그"].includes(compact)) {
      return true;
    }
    if (/^(.)\1+$/.test(compact) && compact.length <= 3) return true;
    return false;
  }

  // 사진 단계 전용 ask+listen — 백엔드 호출 없이 답변만 분류해서 처리.
  const askPhotoAndListen = useCallback((question: string) => {
    if (!mountedRef.current) return;
    setMessages((prev) => [
      ...prev,
      { id: randomId(), role: "assistant", text: question },
    ]);
    setVoiceState("speaking");

    const handlePhotoAnswer = async (answer: string) => {
      if (!mountedRef.current) return;

      // 환각/무의미 응답이면 사용자 말풍선 표시 안 하고 silent retry (시도 카운트 증가만).
      // 사용자 화면에 "시청해주셔서 감사합니다" 같은 엉뚱한 응답이 보이지 않도록.
      if (isHallucinatedPhotoAnswer(answer)) {
        if (photoAskAttemptsRef.current < 2) {
          photoAskAttemptsRef.current += 1;
          askPhotoAndListen("사진 찍으시겠어요?");
          return;
        }
        // 3회까지 다 환각/무의미면 그냥 저장 완료 (no 로 폴백).
        // 마이크/AudioContext 까지 완전 해제 — releaseMic 가 stopRecognition 도 호출.
        releaseMic();
        stopTts();
        setStageStatus("done");
        stageStatusRef.current = "done";
        const saved = savedRecordCacheRef.current;
        if (saved) setCompletedRecord(saved);
        return;
      }

      // 정상 응답 — 사용자 말풍선 표시 후 분류.
      setMessages((prev) => [...prev, { id: randomId(), role: "user", text: answer }]);

      const verdict = classifyPhotoAnswer(answer);
      if (verdict === "unclear") {
        if (photoAskAttemptsRef.current < 2) {
          photoAskAttemptsRef.current += 1;
          askPhotoAndListen("사진 찍으시겠어요?");
          return;
        }
        // 세 번째도 애매하면 그냥 저장 (no 로 간주).
      }

      // 답변 받음 → 더 이상 듣지 않음.
      // "예" 답변(navigate photoInput)은 unmount 가 releaseMic 트리거하므로 OK.
      // "아니오" 답변(이 화면 유지)은 명시적으로 마이크 해제해야 인디케이터 꺼짐.
      if (verdict === "yes") {
        stopRecognition();
        stopTts();
        setStageStatus("done");
        stageStatusRef.current = "done";
        navigate("photoInput");
        return;
      }
      // no 또는 두 번째 unclear — 완료 모달 노출. 마이크 완전 해제.
      releaseMic();
      stopTts();
      setStageStatus("done");
      stageStatusRef.current = "done";
      const saved = savedRecordCacheRef.current;
      if (saved) setCompletedRecord(saved);
    };

    // TTS 가 끝난 뒤에만 STT 시작 — 사진 질문도 마찬가지로 정확도 우선.
    const begin = () => {
      if (!mountedRef.current || stageStatusRef.current === "done") return;
      setVoiceState("listening");
      void startRecognition(handlePhotoAnswer);
    };
    void playQuestion(question, () => {
      if (mountedRef.current) begin();
    });
  }, [navigate, playQuestion, releaseMic, startRecognition, stopRecognition, stopTts]);

  // 일지 저장 → 사진 질문 단계 진입. 저장 실패 시 asking 단계 유지하고 에러만 표시.
  // saveDiary 는 이 hook 보다 아래에서 useCallback 으로 선언되므로 ref 로 forward-ref 해결.
  const savedRecordCacheRef = useRef<DiaryRecord | null>(null);
  const saveDiaryRef = useRef<(() => Promise<DiaryRecord | null>) | null>(null);
  const handleReadyTransition = useCallback(async () => {
    stopRecognition();
    stopTts();
    setVoiceState("thinking");
    const fn = saveDiaryRef.current;
    const saved = fn ? await fn() : null;
    if (!mountedRef.current) return;
    if (!saved) {
      // 저장 실패 — asking 으로 유지 (에러 메시지는 saveDiary 가 setErrorMessage 함).
      setStageStatus("asking");
      stageStatusRef.current = "asking";
      return;
    }
    savedRecordCacheRef.current = saved;
    setStageStatus("asking_photo");
    stageStatusRef.current = "asking_photo";
    photoAskAttemptsRef.current = 0;
    askPhotoAndListen("기록 저장했어요. 사진도 찍으시겠어요?");
  }, [askPhotoAndListen, stopRecognition, stopTts]);

  // ── 세션 상태 적용 (start/reply 응답 공통) ──
  const applySessionState = useCallback(
    (state: VoiceSessionStateResponse) => {
      const isReady = state.status === "ready_to_confirm";
      setDraft(state.draft || {});

      if (isReady) {
        // 확정 단계 도달 — 일지 즉시 저장 후 "사진도 찍으시겠어요?" 로 전환.
        // 백엔드의 마지막 질문 텍스트는 사용하지 않음 (저장 확인 카드 제거됨).
        void handleReadyTransition();
        return;
      }

      setStageStatus("asking");
      askAndListen(state.question, state.question_source === "ai" ? "ai" : "heuristic");
    },
    [askAndListen, handleReadyTransition],
  );

  // ── 세션 부트스트랩 — 화면 진입 시 자동 실행 ──
  const bootstrapSession = useCallback(async () => {
    setErrorMessage("");
    setVoiceState("thinking");

    const response = await startVoiceSession({
      farmer_id: effectiveFarmerId,
      selected_todo: selectedTodo
        ? {
            todo_id: selectedTodo.todo_id,
            group_no: selectedTodo.group_no,
            prj_id: selectedTodo.prj_id,
            project_id: selectedTodo.project_id,
            activity_id: selectedTodo.activity_id,
            job_cd: selectedTodo.job_cd,
            todo_title: selectedTodo.todo_title,
            activity_name: selectedTodo.activity_name,
            parcel_no: selectedTodo.parcel_no || "",
            field_id: selectedTodo.field_id || "",
            required_evidence_types: selectedTodo.required_evidence_types || [],
          }
        : null,
    });

    if (!mountedRef.current) return;

    if (!response) {
      setFallbackNotice("서버 연결이 불안정해 기본 대화 모드로 진행합니다.");
      const fallbackQuestion = selectedTodo
        ? `${selectedTodo.todo_title}, 작업 내용 말씀해주세요.`
        : "오늘 어떤 작업 하셨어요?";
      askAndListen(fallbackQuestion, "heuristic");
      return;
    }

    setSessionId(response.session_id);
    applySessionState(response);
  }, [applySessionState, askAndListen, selectedTodo]);

  useEffect(() => {
    // Strict Mode 가드: 한 번만 실행. unmount 됐다가 즉시 remount 돼도 두 번째는 skip.
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;
    void bootstrapSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 저장: 일지를 백엔드에 보내고 DiaryRecord 반환. 모달은 호출자가 결정 ──
  const saveDiary = useCallback(async (): Promise<DiaryRecord | null> => {
    if (isSaving) return null;
    setIsSaving(true);
    setErrorMessage("");

    const latestUser = [...messages].reverse().find((m) => m.role === "user")?.text || "";
    const confirmedDraft = {
      ...draft,
      work_detail: String(draft.work_detail || latestUser || ""),
    };

    const finalized = sessionId ? await finalizeVoiceSession(sessionId, confirmedDraft) : null;
    const manualInput = (finalized?.manual_input || {}) as Record<string, unknown>;

    const input: ManualDiaryInput = {
      workDate: String(manualInput.workDate || new Date().toISOString().slice(0, 10)),
      work: String(manualInput.work || selectedTodo?.job_name || selectedTodo?.activity_name || "기타"),
      field: String(manualInput.field || selectedTodo?.parcel_no || "기타"),
      cropName: String(manualInput.cropName || "벼"),
      workDetail: String(manualInput.workDetail || confirmedDraft.work_detail || ""),
      linkedEvidenceText: String(manualInput.linkedEvidenceText || ""),
      todo_id: String(manualInput.todo_id || selectedTodo?.todo_id || ""),
      group_no: manualInput.group_no != null
        ? Number(manualInput.group_no)
        : selectedTodo?.group_no,
      prj_id: String(manualInput.prj_id || selectedTodo?.prj_id || ""),
      project_id: String(manualInput.project_id || selectedTodo?.project_id || selectedTodo?.prj_id || ""),
      activity_id: String(manualInput.activity_id || selectedTodo?.activity_id || ""),
      job_cd: String(manualInput.job_cd || selectedTodo?.job_cd || ""),
      parcel_no: String(manualInput.parcel_no || selectedTodo?.parcel_no || ""),
      field_id: String(manualInput.field_id || selectedTodo?.field_id || ""),
      farmer_id: effectiveFarmerId,
      input_type: "voice",
      input_type_cd: "voice_chat",
    };

    const result = await saveManualDiaryRecord(input);
    if (!mountedRef.current) return null;
    if (result.status === "failed") {
      setErrorMessage(result.message);
      setIsSaving(false);
      return null;
    }

    setInputMethod("voice");
    setSavedRecord({
      date: result.record.work_date,
      work: result.record.work_stage_detail || result.record.work_stage,
      field: input.field,
      amount: String(draft.quantity || "-"),
      business: "공익직불 준수사업",
      hasPhoto: result.record.linked_evidence_ids.length > 0,
      memo: result.record.work_detail,
      inputMethod: "voice",
    });

    if (onDiarySaved) await onDiarySaved(input, result.record);
    setIsSaving(false);
    return result.record;
  }, [draft, isSaving, messages, onDiarySaved, selectedTodo, sessionId, setInputMethod, setSavedRecord]);

  // saveDiary 를 ref 에 등록 — handleReadyTransition 이 위에서 saveDiaryRef.current 로 호출.
  useEffect(() => {
    saveDiaryRef.current = saveDiary;
  }, [saveDiary]);

  // ── 사용자 액션: 대화 중단 ──
  //   - asking 단계: 지금까지 모은 내용으로 저장 + 사진 질문 단계로 진행
  //   - asking_photo 단계: 사진 건너뛰고 곧장 완료 모달
  function handleStop() {
    stopRecognition();
    stopTts();
    setVoiceState("idle");
    if (stageStatusRef.current === "asking_photo") {
      setStageStatus("done");
      stageStatusRef.current = "done";
      const saved = savedRecordCacheRef.current;
      if (saved) setCompletedRecord(saved);
      return;
    }
    void handleReadyTransition();
  }

  // ── 상태 라벨 ──
  const statusLabel = useMemo(() => {
    if (stageStatus === "done") return "마무리 중…";
    if (stageStatus === "asking_photo") {
      if (voiceState === "speaking") return "🔈 사진 찍을지 묻는 중";
      if (voiceState === "listening") return "🎙️ 예/아니요 답해주세요";
      return "잠시만요…";
    }
    if (voiceState === "speaking") return "🔈 말하는 중 (바로 답하셔도 됩니다)";
    if (voiceState === "listening") return "🎙️ 듣고 있어요";
    if (voiceState === "thinking") return "💭 정리 중…";
    return "잠시만요…";
  }, [stageStatus, voiceState]);

  // 풀 화면 voice 모드 — ChatGPT Voice 스타일. 검은 배경 + 중앙 orb + 자막.
  // 화면 중심은 "지금 누가/무엇을 말하는가" — caption + orb 의 시각 상태가 핵심.
  const lastAssistantText = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant")?.text || "",
    [messages],
  );
  const lastUserText = useMemo(
    () => [...messages].reverse().find((m) => m.role === "user")?.text || "",
    [messages],
  );
  // 큰 자막 — 지금 화면 중앙에 보일 한 문장.
  const caption = useMemo(() => {
    if (stageStatus === "done") return isSaving ? "저장하고 있어요…" : "마무리하고 있어요…";
    if (voiceState === "speaking" && lastAssistantText) return lastAssistantText;
    if (voiceState === "thinking") return lastUserText ? `"${lastUserText}"` : "정리하고 있어요…";
    if (voiceState === "listening") return lastAssistantText || "말씀해 주세요";
    return lastAssistantText || "잠시만 기다려 주세요…";
  }, [stageStatus, isSaving, voiceState, lastAssistantText, lastUserText]);
  // 작은 상태 라벨 — orb 아래에 작게.
  const subLabel = useMemo(() => {
    if (stageStatus === "done") return "";
    if (voiceState === "speaking") return "AI 가 말하고 있어요 · 바로 답하셔도 됩니다";
    if (voiceState === "listening") return "🎙️ 듣고 있어요";
    if (voiceState === "thinking") return "💭 정리 중";
    return "";
  }, [stageStatus, voiceState]);

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        // 저탄마을 light cream — 다른 화면 (홈/일지/사진/모달) 과 동일 톤.
        // 중앙 위쪽에 옅은 accent-soft (green) tint 로 orb 가 자연스럽게 떠 있게.
        background:
          "radial-gradient(ellipse 95% 65% at center 26%, #eef6ec 0%, var(--bg-soft) 50%, #f4ecd6 100%)",
        color: "var(--ink)",
        zIndex: 50,
      }}
    >
      {/* 상단 — 헤더. iOS safe-area-inset-top 만큼 위쪽 여유 추가.
          라벨은 absolute center 로 화면 절대 중심 (양옆 버튼 폭과 무관). */}
      <div
        className="relative flex shrink-0 items-center justify-between gap-3 px-4 pb-3"
        style={{ paddingTop: "max(20px, env(safe-area-inset-top))" }}
      >
        {/* 가운데 라벨 — absolute center. pointer-events-none 로 양옆 버튼 클릭 막지 않음. */}
        <div
          className="pointer-events-none absolute inset-x-0 flex items-center justify-center"
          style={{ top: "max(20px, env(safe-area-inset-top))", bottom: 12 }}
        >
          <p
            className="text-lg font-bold"
            style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}
          >
            음성으로 기록
          </p>
        </div>

        <button
          onClick={() => {
            stopRecognition();
            stopTts();
            navigate("home");
          }}
          className="relative z-10 flex items-center justify-center rounded-full active:opacity-80 transition-opacity"
          aria-label="뒤로"
          style={{
            width: 44,
            height: 44,
            background: "#ffffff",
            border: "1.5px solid var(--accent)",
            boxShadow: "0 2px 6px rgba(31, 42, 31, 0.08)",
          }}
        >
          <ChevronLeft className="h-6 w-6" style={{ color: "var(--accent-dark)" }} strokeWidth={2.5} />
        </button>

        {stageStatus === "asking" || stageStatus === "asking_photo" ? (
          <button
            onClick={handleStop}
            className="relative z-10 flex items-center gap-1.5 rounded-full px-4 text-base font-bold active:opacity-80 transition-opacity whitespace-nowrap"
            style={{
              minHeight: 44,
              background: "#ffffff",
              color: "var(--ink)",
              border: "1.5px solid var(--line)",
              boxShadow: "0 2px 6px rgba(31, 42, 31, 0.08)",
            }}
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
            그만하기
          </button>
        ) : (
          <div style={{ width: 44, height: 44 }} />
        )}
      </div>

      {/* brand accent — 헤더와 본문 사이에 옅은 brand green wave glow. */}
      <div
        className="shrink-0 mx-auto"
        style={{
          width: "60%",
          height: 1,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(47, 109, 79, 0.35) 50%, transparent 100%)",
          boxShadow: "0 0 10px rgba(47, 109, 79, 0.20)",
        }}
      />

      {/* 중앙 — orb + 자막 */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-12">
        <VoiceOrb state={voiceState} amplitude={amplitude} />

        <div className="text-center max-w-md min-h-[6rem] flex items-center justify-center">
          <p
            className="text-2xl font-bold leading-relaxed"
            style={{ color: "var(--ink)", letterSpacing: "-0.015em", lineHeight: 1.45 }}
          >
            {caption}
          </p>
        </div>
      </div>

      {/* 하단 — 상태 라벨(chip) + 에러 */}
      <div className="shrink-0 px-6 pb-10 pt-2 flex flex-col items-center min-h-[5rem]">
        {subLabel && (
          <span
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-base font-bold"
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent-dark)",
              border: "1.5px solid var(--accent)",
              letterSpacing: "-0.01em",
              boxShadow: "0 2px 8px rgba(47, 109, 79, 0.10)",
            }}
          >
            {subLabel}
          </span>
        )}
        {errorMessage && (
          <p className="mt-2 text-sm font-bold text-center" style={{ color: "var(--danger)" }}>
            {errorMessage}
          </p>
        )}
        {fallbackNotice && (
          <p className="mt-1 text-xs font-bold text-center" style={{ color: "var(--warn)" }}>
            {fallbackNotice}
          </p>
        )}
        {!supportsSpeech && (
          <p className="mt-2 text-xs text-center" style={{ color: "var(--muted)" }}>
            이 기기에서는 음성 인식이 지원되지 않습니다.
          </p>
        )}
      </div>

      <CompletionModal
        open={!!completedRecord}
        title="기록을 완료했습니다"
        detailLines={
          completedRecord
            ? [
                { label: "날짜", value: completedRecord.work_date },
                { label: "작업", value: completedRecord.work_stage_detail || completedRecord.work_stage || "-" },
                { label: "내용", value: completedRecord.work_detail || "-" },
              ]
            : []
        }
        onHome={() => navigate("home")}
      />
    </div>
  );
}

/**
 * 음성 orb — 풀 화면 voice 모드의 중앙 시각 요소.
 *
 * state 별 색·애니메이션:
 *   - idle      : 회색 정적
 *   - listening : 초록 — amplitude(사용자 RMS) 에 따라 scale + glow + 외곽 wave ring
 *   - speaking  : 보라/분홍 — 인공 sine pulse (TTS 출력 amplitude 캡쳐 안 됨)
 *   - thinking  : 황갈색 + 외곽 dashed ring 회전 (animate-spin)
 *
 * amplitude (0~1) 가 부모에서 매 frame 업데이트되어 scale/glow 동적 변화.
 */
function VoiceOrb({
  state,
  amplitude,
}: {
  state: "idle" | "speaking" | "listening" | "thinking";
  amplitude: number;
}) {
  // 저탄마을 톤 — green + warm earth (보라/회색 X).
  //   listening : vivid green (사용자가 능동적으로 말함)
  //   speaking  : warm cream/beige (AI 가 부드럽게 안내)
  //   thinking  : copper amber (잠시 멈춤)
  //   idle      : 옅은 sage
  const palette =
    state === "listening"
      ? { core: "#a7f0c9", mid: "#36b07a", outer: "#1f5e42", glow: "rgba(70, 210, 140, 0.55)" }
      : state === "speaking"
        ? { core: "#fbecc8", mid: "#d4a86a", outer: "#6f4a1c", glow: "rgba(220, 180, 110, 0.50)" }
        : state === "thinking"
          ? { core: "#f4d8a4", mid: "#c89048", outer: "#7a4f1a", glow: "rgba(230, 170, 90, 0.45)" }
          : { core: "#cfddd1", mid: "#7c9686", outer: "#3a4e42", glow: "rgba(140, 170, 150, 0.30)" };

  const amp = state === "idle" ? 0 : amplitude;
  const scale = 1 + amp * 0.18;
  const glowSize = 70 + amp * 80;
  const ringScale = 1.25 + amp * 0.45;
  // light cream 배경에서 ring 이 잘 보이게 baseline 조금 강화.
  const ringOpacity = 0.28 + amp * 0.52;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: 300, height: 300 }}
    >
      {/* 외곽 wave ring — amplitude 강할수록 더 크게 + 밝게 */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${palette.glow} 0%, transparent 62%)`,
          transform: `scale(${ringScale})`,
          opacity: ringOpacity,
          transition: "transform 100ms ease-out, opacity 100ms ease-out",
        }}
      />
      {/* thinking 상태 — 외곽 회전 dashed ring */}
      {state === "thinking" && (
        <div
          className="absolute rounded-full animate-spin"
          style={{
            width: 264,
            height: 264,
            border: "2.5px dashed rgba(230, 170, 90, 0.55)",
            animationDuration: "3.2s",
          }}
        />
      )}
      {/* 메인 orb — 광택 gradient + amplitude scale */}
      <div
        className="rounded-full"
        style={{
          width: 220,
          height: 220,
          background: `radial-gradient(circle at 32% 30%, ${palette.core}, ${palette.mid} 55%, ${palette.outer} 100%)`,
          boxShadow: [
            `0 0 ${glowSize}px ${palette.glow}`,
            "inset 0 -28px 50px rgba(0,0,0,0.32)",
            "inset 0 10px 22px rgba(255,255,255,0.20)",
          ].join(", "),
          transform: `scale(${scale})`,
          transition: "transform 80ms ease-out, box-shadow 100ms ease-out",
        }}
      />
    </div>
  );
}

function ChatBubble({
  role,
  text,
}: {
  role: "assistant" | "user";
  text: string;
}) {
  // 도움말 챗봇과 동일 톤 — user = 진초록 + 그림자, assistant = bg-soft + line-soft border
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[80%] px-4 py-2.5 text-base font-bold rounded-2xl"
          style={{
            background: "var(--primary)",
            color: "#ffffff",
            borderBottomRightRadius: 6,
            boxShadow: "0 2px 8px rgba(47, 109, 79, 0.20)",
          }}
        >
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[80%] px-4 py-2.5 text-base font-bold rounded-2xl"
        style={{
          background: "var(--bg-soft)",
          border: "1px solid var(--line-soft)",
          color: "var(--ink)",
          borderBottomLeftRadius: 6,
        }}
      >
        {text}
      </div>
    </div>
  );
}

function ListeningDots({ active }: { active: boolean }) {
  return (
    <div className="flex h-5 items-center gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`w-1 rounded-full ${active ? "bg-primary animate-wave" : "bg-muted-foreground/30 h-2"}`}
          style={active ? { animationDelay: `${i * 0.1}s` } : undefined}
        />
      ))}
    </div>
  );
}

