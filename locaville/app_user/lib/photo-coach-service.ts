"use client";

/** 라이브 카메라 frame 1장 → 백엔드 Vision LLM 코칭 메시지.
 *
 *  POST /photo-guard/coach (multipart) — 응답:
 *    { kind, status: "ok"|"adjust"|"wait", message, can_capture }
 *
 *  PhotoLiveCoachOverlay 가 3초마다 호출. 폴링이라 한 frame 실패는 swallow 권장.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export type PhotoCoachKind = "photo" | "receipt" | "certificate";
export type PhotoCoachStatus = "ok" | "adjust" | "wait";

export interface PhotoCoachResult {
  kind: PhotoCoachKind;
  status: PhotoCoachStatus;
  message: string;
  can_capture: boolean;
}

export async function requestPhotoCoach(
  blob: Blob,
  evidenceType?: string,
  jobCd?: string,
): Promise<PhotoCoachResult> {
  const fd = new FormData();
  fd.append("file", blob, "frame.jpg");
  if (evidenceType) fd.append("evidence_type", evidenceType);
  // (job_cd, evidence_type) 조합으로 backend 가 시행지침 9p 표의 정확 기준 lookup.
  if (jobCd) fd.append("job_cd", jobCd);

  const res = await fetch(`${API_BASE_URL}/photo-guard/coach`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`photo coach 호출 실패 (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as PhotoCoachResult;
  return data;
}
