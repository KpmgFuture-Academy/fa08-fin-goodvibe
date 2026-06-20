/** v0_farmer 의 AI 호출 클라이언트 — backend `/ai/*` 엔드포인트 래퍼.
 *  현재 사용처: HelpScreen RAG 챗(`requestActivityHelp`), ManualInputScreen 마이크(`requestOpenAiStt`), advice 재생(`requestOpenAiTts`).
 *  OpenAI/Returnzero key 는 backend 가 보유, 프론트는 호출만 한다. */
import { getApiBaseUrl } from "./data-source";
import { SAMPLE_USER_CONTEXT } from "./sample-user-context";

export type ActivityHelpContext = {
  activity_id?: string;
  activity_type?: string;
  activity_name?: string;
  job_cd?: string;
  todo_id?: string;
};

export type ActivityHelpResponse = {
  answer: string;
  source_type?: string;
  used_context?: Array<{
    path: string;
    snippet?: string;
    score?: number;
  }>;
};

export type SttResponse = {
  text: string;
  source: string;
  error_message?: string;
};

export type TtsResponse = {
  audio_url: string;
  source: string;
  mime_type?: string;
  error_message?: string;
};

export async function requestActivityHelp(question: string, context?: ActivityHelpContext | null): Promise<ActivityHelpResponse | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        farmer_id: SAMPLE_USER_CONTEXT.farmer_id,
        context: context ?? {},
      }),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as Partial<ActivityHelpResponse>;
    if (!data || typeof data.answer !== "string" || data.answer.trim() === "") {
      return null;
    }

    return {
      answer: data.answer,
      source_type: typeof data.source_type === "string" ? data.source_type : "",
      used_context: Array.isArray(data.used_context)
        ? data.used_context
            .filter((item): item is { path: string; snippet?: string; score?: number } => Boolean(item && typeof item === "object" && typeof item.path === "string"))
            .map((item) => ({
              path: item.path,
              snippet: typeof item.snippet === "string" ? item.snippet : "",
              score: typeof item.score === "number" ? item.score : 0,
            }))
        : [],
    };
  } catch {
    return null;
  }
}

export async function requestOpenAiStt(file: File, language = "ko"): Promise<SttResponse | null> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", language);

    const response = await fetch(`${getApiBaseUrl()}/ai/stt`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<SttResponse>;
    if (!data || typeof data.text !== "string" || typeof data.source !== "string") {
      return null;
    }
    return {
      text: data.text,
      source: data.source,
      error_message: typeof data.error_message === "string" ? data.error_message : "",
    };
  } catch {
    return null;
  }
}

/**
 * `/ai/tts` 가 mp3 bytes 를 audio/mpeg 스트림으로 전송하므로 blob → object URL 로 변환.
 * 응답이 204(No Content)면 OpenAI 키 미설정/실패 — caller 가 브라우저 speechSynthesis 폴백.
 * 호출자 코드 호환을 위해 반환 형태는 기존과 동일 (`audio_url` 필드에 object URL).
 *
 * 주의: 반환된 object URL 은 메모리에 blob 참조를 유지하므로, audio 재생이 끝나면
 * URL.revokeObjectURL 로 해제 권장 (미해제도 페이지 unload 시 GC).
 */
export async function requestOpenAiTts(text: string, voice = "default"): Promise<TtsResponse | null> {
  // 사용자가 설정에서 음성 안내 OFF — TTS 호출 자체를 skip (network 비용 절감 + 청각 접근성).
  if (typeof window !== "undefined" && window.localStorage.getItem("voice_guide_enabled") === "0") {
    return { audio_url: "", source: "disabled", mime_type: "audio/mpeg", error_message: "" };
  }
  try {
    const response = await fetch(`${getApiBaseUrl()}/ai/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
    if (response.status === 204) {
      return { audio_url: "", source: "fallback", mime_type: "audio/mpeg", error_message: "" };
    }
    if (!response.ok) return null;
    const blob = await response.blob();
    if (blob.size === 0) {
      return { audio_url: "", source: "fallback", mime_type: "audio/mpeg", error_message: "" };
    }
    return {
      audio_url: URL.createObjectURL(blob),
      source: "google_tts",
      mime_type: blob.type || "audio/mpeg",
      error_message: "",
    };
  } catch {
    return null;
  }
}
