import { PARCELS } from "@/lib/farm-reference";
import { getCachedParcels } from "@/lib/parcel-service";
import type { TodoItemApi } from "@/lib/todo-service";

// 모듈 캐시(backend `/farmer/{id}/parcels` 결과) 우선 + 정적 alias seed 폴백.
// 캐시 항목은 parcel_no/parcel_regno/usage/주소만 있고 alias 가 없으므로 alias 매칭은
// 정적 PARCELS 가 담당하고, ID 기반 매칭은 캐시(권위) → 정적(seed) 순으로 본다.
function lookupParcels(): Array<{
  field_id: string;
  parcel_no: string;
  parcel_regno: string;
  display_name: string;
  aliases: string[];
}> {
  const cached = getCachedParcels();
  if (cached.length === 0) return PARCELS;
  const cachedMapped = cached.map((p) => {
    const seed = PARCELS.find(
      (s) => s.parcel_no === p.parcel_no || s.parcel_regno === p.parcel_regno,
    );
    return {
      field_id: seed?.field_id || "",
      parcel_no: p.parcel_no,
      parcel_regno: p.parcel_regno,
      display_name: seed?.display_name || p.addr_2 || p.parcel_regno,
      aliases: seed?.aliases || [],
    };
  });
  return cachedMapped;
}

export type ParcelInference = {
  /** 사용자 표시·저장 요청에 사용할 식별자. parcel.parcel_regno 와 동일. */
  field_id: string;
  /** parcel.parcel_no (INT) 의 문자열 표현. */
  parcel_no: string;
  label: string;
};

// 현 시드(저탄선도마을 / amo_regno=1110000002 김영수) 기본 필지: parcel_no=1 (벼논).
const DEFAULT_PARCEL: ParcelInference = {
  field_id: "",
  parcel_no: "1",
  label: "1번 논 (벼)",
};

// Legacy 값 호환 매핑 — 옛 데이터/링크에서 들어온 코드를 현 parcel_no 로 매핑.
const LEGACY_PARCEL_MAP: Record<string, ParcelInference> = {
  // 옛 JT-RPA-002 / 11003 / 201 → 현 1 (1번 논, 벼)
  FIELD001: { field_id: "", parcel_no: "1", label: "1번 논 (벼)" },
  PARCEL001: { field_id: "", parcel_no: "1", label: "1번 논 (벼)" },
  "JT-RPA-002": { field_id: "", parcel_no: "1", label: "1번 논 (벼)" },
  "11003": { field_id: "", parcel_no: "1", label: "1번 논 (벼)" },
  "201": { field_id: "", parcel_no: "1", label: "1번 논 (벼)" },
  // 옛 JT-DFA-002 / 11004 / 202 → 현 2 (2번 밭, 고추)
  FIELD002: { field_id: "", parcel_no: "2", label: "2번 밭 (고추)" },
  PARCEL003: { field_id: "", parcel_no: "2", label: "2번 밭 (고추)" },
  "JT-DFA-002": { field_id: "", parcel_no: "2", label: "2번 밭 (고추)" },
  "11004": { field_id: "", parcel_no: "2", label: "2번 밭 (고추)" },
  "202": { field_id: "", parcel_no: "2", label: "2번 밭 (고추)" },
};

function labelFromParcel(p: { display_name?: string }): string {
  return (p.display_name || "").trim();
}

/**
 * 입력값을 표준 필지 식별자로 정규화한다.
 * - JT-XXX-NNN 형태(parcel_regno) → 그대로
 * - 순수 숫자(11003 등 parcel_no INT 문자열) → 그대로
 * - LEGACY (FIELD001 / PARCEL003 등) → LEGACY_PARCEL_MAP 으로 폴백
 * - 그 외 → 입력 그대로 통과 (가짜 FIELDNNN/PARCELNNN 생성 금지)
 */
export function normalizeFieldId(value?: string | null): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  const legacy = LEGACY_PARCEL_MAP[upper];
  if (legacy) return legacy.field_id;
  return raw;
}

export function normalizeParcelNo(value?: string | null): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  const legacy = LEGACY_PARCEL_MAP[upper];
  if (legacy) return legacy.parcel_no;
  return raw;
}

function fromLegacy(value?: string | null): ParcelInference | null {
  if (!value) return null;
  return LEGACY_PARCEL_MAP[value.trim().toUpperCase()] || null;
}

function fromRefs(
  input: { field_id?: string; parcel_no?: string } | null | undefined,
): ParcelInference | null {
  if (!input) return null;
  const normalizedFieldId = input.field_id ? input.field_id.trim() : "";
  const normalizedParcelNo = input.parcel_no ? input.parcel_no.trim() : "";

  // 1) legacy 코드면 매핑된 새 필지 반환
  const legacy = fromLegacy(normalizedFieldId) || fromLegacy(normalizedParcelNo);
  if (legacy) return legacy;

  // 2) 새 PARCELS 정적 데이터와 매칭
  const found = lookupParcels().find((p) => {
    if (normalizedFieldId && p.field_id === normalizedFieldId) return true;
    if (normalizedFieldId && p.parcel_regno === normalizedFieldId) return true;
    if (normalizedParcelNo && p.parcel_no === normalizedParcelNo) return true;
    if (normalizedParcelNo && p.parcel_regno === normalizedParcelNo) return true;
    return false;
  });
  if (!found) return null;

  return {
    field_id: found.field_id,
    parcel_no: found.parcel_no,
    label: labelFromParcel(found),
  };
}

export function inferParcelFromText(text?: string | null): ParcelInference | null {
  if (!text) return null;
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  const byAlias = lookupParcels().find((p) =>
    p.aliases.some((alias) => normalized.includes(alias.toLowerCase())),
  );
  if (byAlias) {
    return {
      field_id: byAlias.field_id,
      parcel_no: byAlias.parcel_no,
      label: labelFromParcel(byAlias),
    };
  }

  // 신 ID 패턴(JT-XXX-NNN) 직접 인식
  const regnoMatch = text.match(/\bJT-[A-Z]{3}-\d{3}\b/i);
  if (regnoMatch) {
    const byCode = fromRefs({ field_id: regnoMatch[0].toUpperCase() });
    if (byCode) return byCode;
  }

  // legacy 직접 토큰 (FIELD001 / PARCEL003 등) 도 한 번 더 시도
  const legacyMatch = text.match(/\b(FIELD\d{3}|PARCEL\d{3})\b/i);
  if (legacyMatch) {
    const legacy = fromLegacy(legacyMatch[0]);
    if (legacy) return legacy;
  }

  return null;
}

export function inferParcelFromTodo(todo?: TodoItemApi | null): ParcelInference | null {
  if (!todo) return null;
  return fromRefs({ parcel_no: todo.parcel_no, field_id: todo.field_id });
}

export function inferParcelLabel(input?: {
  todo?: TodoItemApi | null;
  text?: string | null;
  field_id?: string | null;
  parcel_no?: string | null;
  fallbackToDefault?: boolean;
}) {
  const fromTodo = inferParcelFromTodo(input?.todo);
  if (fromTodo) return fromTodo;

  const fromIds = fromRefs({
    field_id: input?.field_id || "",
    parcel_no: input?.parcel_no || "",
  });
  if (fromIds) return fromIds;

  const fromText = inferParcelFromText(input?.text);
  if (fromText) return fromText;

  return input?.fallbackToDefault ? DEFAULT_PARCEL : null;
}
