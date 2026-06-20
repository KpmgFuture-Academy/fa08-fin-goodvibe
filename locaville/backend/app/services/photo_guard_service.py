"""사진 가이드 — 농가가 증빙 사진 찍는 순간 evidence_type 에 맞게 분류.

세 가지 evidence kind:
  - PIC (작업 사진): 야외/농경지 분류 — GPS + Vision
  - RCT (영수증):     영수증 + 농자재 분류 + 가게/금액/품목 OCR
  - EDU (이수증):     교육 인증서 + 발급기관/이수일 추출

PhotoGuardOverlay 가 셔터 직후 호출 → OpenAI Vision (gpt-4o-mini, low-detail)
→ JSON 분류 결과 반환. 비용: 호출당 약 $0.0001 (영수증 OCR 시 ~$0.0003).
"""
from __future__ import annotations

import base64
import io
import json
import os
from typing import Any

from app.services.ai_service import (
    AIServiceError,
    _extract_first_json_object,
    _get_coach_client_and_model,
    _get_openai_client,
    _get_verdict_client_and_model,
    _get_vision_model_name,
)


def _resize_for_send(image_bytes: bytes, content_type: str, max_side: int, quality: int) -> tuple[bytes, str]:
    """전송 전 긴 변 max_side 로 축소 → Gemini 이미지 토큰·대역폭 절감.
    Pillow 없거나 실패 시 원본 그대로 반환 (절대 막지 않음)."""
    try:
        from PIL import Image
        with Image.open(io.BytesIO(image_bytes)) as im:
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            im.thumbnail((max_side, max_side))
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=quality)
            return buf.getvalue(), "image/jpeg"
    except Exception:  # noqa: BLE001
        return image_bytes, content_type


# ============================================================
# 시스템 프롬프트 — evidence_type 별 분기
# ============================================================

_PROMPT_PIC = """당신은 농가가 영농 증빙 사진을 찍는 순간을 검수하는 짧은 도우미입니다.
사진 한 장을 보고 다음 JSON 만 출력하세요. 설명/주석 금지.

{
  "kind": "photo",
  "is_outdoor": boolean,
  "is_field": boolean,
  "label": string,
  "reason": string
}

규칙:
- is_outdoor: 야외이면 true (하늘·자연광·논·밭·길 보임)
- is_field: 농경지(논·밭·과수원·축사) 이면 true. 일반 야외(공원·도로)는 false
- label: 한국어 12자 이내 (예: "논이에요", "실내인 것 같아요")
- reason: 한국어 25자 이내 (예: "그대로 찍으셔도 좋아요" / "논으로 나가 주세요")
"""

_PROMPT_RCT = """당신은 농가가 영농 영수증을 찍는 순간을 검수하고 OCR 하는 도우미입니다.
사진 한 장을 보고 다음 JSON 만 출력하세요. 설명/주석 금지.

{
  "kind": "receipt",
  "is_receipt": boolean,
  "is_farm_related": boolean,
  "vendor": string,
  "amount": number,
  "items": [string, ...],
  "purchased_at": string,
  "label": string,
  "reason": string
}

규칙:
- is_receipt: 영수증(또는 거래명세표·세금계산서) 이면 true
- is_farm_related: 비료·농약·종자·농기구 등 영농 관련이면 true. 식당·편의점·생필품은 false
- vendor: 가게/사업자 이름. 불명이면 빈 문자열
- amount: 합계 금액(숫자만, 콤마/원화 기호 제거). 불명이면 0
- items: 주요 품목 1~3개 (간단히). 불명이면 빈 배열
- purchased_at: 결제일 (YYYY-MM-DD 가능하면). 불명이면 빈 문자열
- label: 한국어 12자 이내 (예: "농자재 영수증이에요")
- reason: 한국어 25자 이내 (예: "그대로 올려주세요" / "다른 영수증 같아요")
"""

_PROMPT_EDU = """당신은 농가가 영농 교육 이수증을 찍는 순간을 검수하는 도우미입니다.
사진 한 장을 보고 다음 JSON 만 출력하세요. 설명/주석 금지.

{
  "kind": "certificate",
  "is_certificate": boolean,
  "is_farm_related": boolean,
  "issuer": string,
  "title": string,
  "issued_at": string,
  "label": string,
  "reason": string
}

규칙:
- is_certificate: 이수증/수료증/인증서 형태면 true
- is_farm_related: 영농·공익직불·친환경 등 농업 관련이면 true
- issuer: 발급기관 (예: "농촌진흥청", "○○농업기술센터"). 불명이면 빈 문자열
- title: 교육명/과정명. 불명이면 빈 문자열
- issued_at: 발급일/이수일 (YYYY-MM-DD). 불명이면 빈 문자열
- label: 한국어 12자 이내 (예: "교육 이수증이에요")
- reason: 한국어 25자 이내
"""


def _select_prompt(evidence_type: str | None) -> tuple[str, str]:
    """evidence_type → (system_prompt, kind). 알 수 없으면 PIC default."""
    code = (evidence_type or "").upper()
    if code.startswith("RCT"):
        return _PROMPT_RCT, "receipt"
    if code == "EDU":
        return _PROMPT_EDU, "certificate"
    return _PROMPT_PIC, "photo"


def analyze_photo_environment(
    image_bytes: bytes,
    content_type: str = "image/jpeg",
    evidence_type: str | None = None,
) -> dict[str, Any]:
    """사진 1장 → evidence_type 별 분류 dict.

    응답 schema (kind 별 다름):
      photo:       {kind, is_outdoor, is_field, label, reason}
      receipt:     {kind, is_receipt, is_farm_related, vendor, amount, items, purchased_at, label, reason}
      certificate: {kind, is_certificate, is_farm_related, issuer, title, issued_at, label, reason}

    실패 시 AIServiceError raise. 호출자가 graceful fallback 처리.
    """
    system_prompt, kind = _select_prompt(evidence_type)
    # 영수증 OCR 는 항목/금액 추출 필요해 max_tokens / detail 살짝 ↑
    max_tokens = 240 if kind == "receipt" else 160 if kind == "certificate" else 120
    detail = "high" if kind in ("receipt", "certificate") else "low"

    client = _get_openai_client()
    model = _get_vision_model_name()
    image_b64 = base64.b64encode(image_bytes).decode("ascii")

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "이 사진을 평가해 주세요."},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{content_type};base64,{image_b64}",
                                "detail": detail,
                            },
                        },
                    ],
                },
            ],
            response_format={"type": "json_object"},
            max_tokens=max_tokens,
            temperature=0.2,
        )
        raw = (resp.choices[0].message.content or "").strip()
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise AIServiceError(f"Vision 응답 파싱 실패: {e}", status_code=502) from e
    except AIServiceError:
        raise
    except Exception as e:  # noqa: BLE001
        raise AIServiceError(f"Vision 호출 실패: {e}", status_code=503) from e

    # kind 별 fallback 채움
    if kind == "receipt":
        return {
            "kind": "receipt",
            "is_receipt": bool(data.get("is_receipt")),
            "is_farm_related": bool(data.get("is_farm_related")),
            "vendor": str(data.get("vendor") or ""),
            "amount": _to_number(data.get("amount")),
            "items": _to_string_list(data.get("items")),
            "purchased_at": str(data.get("purchased_at") or ""),
            "label": str(data.get("label") or "영수증 확인 못 했어요"),
            "reason": str(data.get("reason") or ""),
        }
    if kind == "certificate":
        return {
            "kind": "certificate",
            "is_certificate": bool(data.get("is_certificate")),
            "is_farm_related": bool(data.get("is_farm_related")),
            "issuer": str(data.get("issuer") or ""),
            "title": str(data.get("title") or ""),
            "issued_at": str(data.get("issued_at") or ""),
            "label": str(data.get("label") or "이수증 확인 못 했어요"),
            "reason": str(data.get("reason") or ""),
        }
    # photo (default)
    return {
        "kind": "photo",
        "is_outdoor": bool(data.get("is_outdoor")),
        "is_field": bool(data.get("is_field")),
        "label": str(data.get("label") or "확인 못 했어요"),
        "reason": str(data.get("reason") or ""),
    }


# ============================================================
# 라이브 코칭 — PhotoLiveCoachOverlay 가 3초마다 호출
# 같은 PIC/RCT/EDU 분기, 단 응답이 짧고 액션형
# ============================================================

_COACH_PROMPT_PIC = """당신은 어르신이 영농 사진을 찍도록 돕는 짧은 안내자입니다. 이건 '판정'이 아니라 '촬영 안내'예요.
화면 한 장을 보고 다음 JSON 만 출력하세요. 설명/주석 금지.

{
  "kind": "photo",
  "status": "ok" | "adjust" | "wait",
  "message": string,
  "can_capture": boolean
}

판단은 너그럽게 — 웬만하면 ok 로 두세요:
- "ok"     — 논·밭·과수원·작업 현장 같은 '바깥 농사 장면'이 화면에 보이면 OK.
            거리가 조금 멀거나, 살짝 기울거나, 약간 흐려도 OK. 정답 구도를 고집하지 마세요.
- "adjust" — 농경지로 보이긴 하나 너무 멀어 무엇인지 전혀 분간이 안 되거나, 화면이 거의 다 어두울 때만.
- "wait"   — 실내이거나 농사와 전혀 무관한 장면일 때만.
- 정확히 어떤 작업인지(회차·단계 등)는 따지지 마세요. 그 판정은 촬영 후에 따로 합니다.
- message: 한국어 15자 이내. **60-80대 어르신께 들리는 쉬운 일상 말**. 예시:
    ok      → "잘 보여요. 찍어 주세요"
    adjust  → "조금 더 가까이 가 주세요" / "조금 더 밝은 곳에서"
    wait    → "논으로 나가 주세요" / "농경지 쪽을 비춰 주세요"
- can_capture: status == "ok" 일 때 true. 애매하면 ok 쪽으로.
- 친근하고 짧게. 명령조 X, 권유 톤.
- **전문 용어 금지** (배수물꼬·경운·바이오차·비료생산업·볏짚 절단·로터리·NPK·복합비료 등).
  기준에 그런 단어가 있어도 message 는 쉬운 일상 표현으로 바꿔 쓰세요.
  예: "배수물꼬가 열려있어요" (X) → "물 빠지는 길이 열려있네요" (O)
      "경운이 잘 됐어요" (X) → "흙이 잘 갈렸어요" (O)
"""

_COACH_PROMPT_RCT = """당신은 어르신이 영수증을 찍도록 돕는 짧은 안내자입니다. 이건 '판정'이 아니라 '촬영 안내'예요.
화면 한 장을 보고 다음 JSON 만 출력하세요. 설명/주석 금지.

{
  "kind": "receipt",
  "status": "ok" | "adjust" | "wait",
  "message": string,
  "can_capture": boolean
}

판단은 아주 너그럽게 — 웬만하면 ok 로 두세요:
- "ok"     — 영수증·거래명세표·계산서 같은 '종이'가 화면에 들어와 있으면 OK.
            살짝 기울거나, 조금 구겨졌거나, 약간 흐려도, 글자 일부만 보여도 OK.
            **평평하게 완벽히 펴지지 않아도 됩니다. 완벽함을 요구하지 마세요.**
- "adjust" — 종이는 보이나 화면 절반 이상이 잘렸거나, 거의 다 어두워 글자가 전혀 안 보일 때만.
- "wait"   — 영수증이 화면에 아예 없을 때만.
- message: 한국어 15자 이내. 어르신께 들리는 부드러운 한 문장. 예시:
    ok      → "좋아요, 찍어 주세요"
    adjust  → "종이가 다 들어오게 해 주세요" / "조금 더 밝은 곳에서"
    wait    → "영수증을 보여 주세요"
- can_capture: status == "ok" 일 때 true. 애매하면 ok 쪽으로.
"""

_COACH_PROMPT_EDU = """당신은 어르신이 교육 이수증을 찍도록 돕는 짧은 안내자입니다. 이건 '판정'이 아니라 '촬영 안내'예요.
화면 한 장을 보고 다음 JSON 만 출력하세요. 설명/주석 금지.

{
  "kind": "certificate",
  "status": "ok" | "adjust" | "wait",
  "message": string,
  "can_capture": boolean
}

판단은 너그럽게 — 웬만하면 ok 로 두세요:
- "ok"     — 이수증·수료증·인증서 같은 '서류'가 화면에 들어와 있으면 OK.
            살짝 기울거나 약간 흐려도, 글자 일부만 보여도 OK.
- "adjust" — 서류는 보이나 화면 절반 이상이 잘렸거나 거의 다 어두워 글자가 전혀 안 보일 때만.
- "wait"   — 서류가 화면에 아예 없을 때만.
- message: 한국어 15자 이내. 어르신께 들리는 부드러운 한 문장.
- can_capture: status == "ok" 일 때 true. 애매하면 ok 쪽으로.
"""


def _select_coach_prompt(evidence_type: str | None) -> tuple[str, str]:
    code = (evidence_type or "").upper()
    if code.startswith("RCT") or code == "BIOCHAR_INVOICE":
        return _COACH_PROMPT_RCT, "receipt"
    if code == "EDU":
        return _COACH_PROMPT_EDU, "certificate"
    return _COACH_PROMPT_PIC, "photo"


# ============================================================
# evidence_type 별 정확한 사진 기준 — 저탄소 농업 프로그램 시행지침 9페이지의 표 기반
# 같은 PIC 류 활동도 회차/단계 별로 기대하는 화면이 다름.
# 예: 중간 물떼기 시작 사진은 물이 빠지기 시작 OK, 종료 사진은 갈라짐 보일 정도 마름.
# 코칭 LLM 의 system prompt 에 prepend 해서 status/message 판단을 도움.
#
# 출처(시행지침 9p 표) 가 확정되기 전까지는 농촌 상식 기반 placeholder.
# 사용자가 정확 표 내용 제공 시 ok/ng 텍스트만 교체.
# ============================================================

PHOTO_CRITERIA: dict[str, dict[str, str]] = {
    # ───── 논물관리: 중간 물떼기 (시작 1차 / 종료 2차) ─────
    # 시행지침 9p: 모내기 후 약 한 달부터 용수 공급 중단 + 배수물꼬 개방하여 2주 이상 마른 상태 유지.
    # 증빙: 시작일과 종료일에 배수물꼬가 개방되었거나 논바닥이 마른 증빙사진 2회.
    # 시작일~종료일 최대 간격 30일 이내.
    "MID_DRAINAGE_START": {
        "title": "중간 물떼기 시작 사진 (1차)",
        "ok": "논에 용수 공급이 중단되고 배수물꼬가 개방된 모습. 배수물꼬가 열려 물이 빠지는 중이거나, 논바닥이 마르기 시작한 상태. 시작일 기준으로 활동이 시작됐음을 보여주는 화면.",
        "ng": "배수물꼬가 닫혀있거나 논에 물이 가득 차 있음. 또는 논이 아닌 일반 풍경.",
    },
    "MID_DRAINAGE_END": {
        "title": "중간 물떼기 종료 사진 (2차)",
        "ok": "2주 이상 마른 상태 유지 후 종료일의 논. 배수물꼬가 개방되어 있거나 논바닥이 완전히 마른 상태. 흙 표면이 드러나거나 갈라짐이 보이면 더 명확.",
        "ng": "물이 다시 차 있거나 마른 상태가 아님.",
    },
    # ───── 논물 얕게 걸러대기 (AWD, 4회 이상) ─────
    # 시행지침 9p: 중간 물떼기 종료일부터 완전 물떼기 이전 시기에
    # 2~5cm 깊이로 용수를 얕게 공급 → 자연건조 시켜 논 바닥을 말리는 과정을 4회 이상 반복.
    # 배수물꼬 부근 둑을 2~5cm 낮게 조성하거나 개량물꼬 조절로 얕게 공급.
    # 증빙: 자연건조 후 마른 논 바닥을 4회 (최소 4일 이상 간격) 이상 사진 제출.
    "AWD_DRY_FIELD": {
        "title": "논물 얕게 걸러대기 — 마른 논바닥",
        "ok": "2~5cm 얕은 용수 공급 후 자연건조된 마른 논바닥. 흙 표면이 드러나거나 갈라짐이 보임. 깊은 물이 차 있지 않음.",
        "ng": "물이 깊게 차 있거나 일반적인 담수 상태. 마른 흔적이 없음.",
    },
    "AWD_DRY_FIELD_ROUND_1": {
        "title": "논물 얕게 걸러대기 — 1회차 마른 논바닥",
        "ok": "1회차 자연건조 후 마른 논바닥. 얕은 물(2~5cm) 공급 후 흙 표면이 드러남.",
        "ng": "물이 깊게 차 있음. 또는 자연건조 흔적 없음.",
    },
    "AWD_DRY_FIELD_ROUND_2": {
        "title": "논물 얕게 걸러대기 — 2회차 마른 논바닥",
        "ok": "2회차 자연건조 후 마른 논바닥 (이전 회차로부터 최소 4일 이상 간격).",
        "ng": "물이 차 있거나 1회차 사진과 동일.",
    },
    "AWD_DRY_FIELD_ROUND_3": {
        "title": "논물 얕게 걸러대기 — 3회차 마른 논바닥",
        "ok": "3회차 자연건조 후 마른 논바닥 (최소 4일 이상 간격).",
        "ng": "물이 차 있음.",
    },
    "AWD_DRY_FIELD_ROUND_4": {
        "title": "논물 얕게 걸러대기 — 4회차 마른 논바닥",
        "ok": "4회차 자연건조 후 마른 논바닥. 활동 완료 (4회 충족).",
        "ng": "물이 차 있음.",
    },
    # ───── 바이오차 투입 (포대 + 살포) ─────
    # 시행지침 9p: 바이오차를 작물재배 전 필지에 투입 후 경운.
    # '비료 공정규격 설정·고시'에 따라 '바이오차로 비료생산업 등록'된 업체의 바이오차만 사용 가능.
    # 지목·재배품목 관계없이 바이오차 투입 후 경운 가능한 농지.
    # 증빙: ① 납품된 바이오차 포대 사진 ② 필지별 바이오차 투입 사진 ③ 세금계산서 또는 이에 준하는 서류.
    "BIOCHAR_BAG": {
        "title": "납품된 바이오차 포대 사진",
        "ok": "바이오차 포대(자루)가 화면에 보임. 비료생산업 등록된 업체의 라벨/봉지 형태로 바이오차임을 확인 가능. 농지 옆 또는 적치 장소.",
        "ng": "포대 없이 흙만 보이거나 일반 비료/자재 포대.",
    },
    "BIOCHAR_SPREADING": {
        "title": "필지별 바이오차 투입 사진",
        "ok": "검은 알갱이 형태의 바이오차가 논·밭 표면에 살포되거나 흙에 섞여 있음. 작물재배 전 필지에 투입된 모습.",
        "ng": "바이오차 안 보이거나 일반 농지 사진. 또는 작물이 이미 자라 있는 상태.",
    },
    # ───── 가을갈이 (이행 전: 볏짚 절단 / 이행 후: 경운 완료) ─────
    # 시행지침 9p: 벼 수확 후 볏짚을 잘게 절단·시용하고 토양에 흙입될 수 있는 깊이로
    # 쟁기 또는 로터리 경운 시행. 동계작물 재배 및 봄철 수거 필지 참여 불가.
    # 증빙: 이행 전(볏짚 절단), 이행 후(경운 완료) 증빙사진 제출.
    "AUTUMN_TILLAGE_BEFORE": {
        "title": "가을갈이 이행 전 사진 — 볏짚 절단",
        "ok": "벼 수확 후 볏짚이 잘게 절단되어 논 표면에 시용된 모습. 토양이 아직 갈아엎히지 않고 평평한 상태에서 잘린 볏짚이 흙 위에 보임.",
        "ng": "볏짚이 절단되지 않은 긴 그루터기 그대로이거나, 볏짚이 안 보임. 또는 이미 경운된 상태.",
    },
    "AUTUMN_TILLAGE_AFTER": {
        "title": "가을갈이 이행 후 사진 — 경운 완료",
        "ok": "쟁기 또는 로터리로 경운 완료된 상태. 볏짚이 토양에 혼입될 깊이로 흙이 갈아엎혀 덩어리진 모습. 표면이 거칠게 뒤집힘.",
        "ng": "볏짚이 그대로 남아 평평하거나 경운 흔적 없음. 또는 동계작물이 재배 중.",
    },
    # ───── 영농폐기물 수거 (시행지침 9p 표 외, 추가 항목) ─────
    "WASTE_COLLECTION": {
        "title": "영농폐기물 수거 사진",
        "ok": "농약병, 멀칭 필름, 비료 포대 등 영농 폐기물이 한 곳에 모아진 모습. 수거 단계임을 알 수 있음.",
        "ng": "일반 쓰레기, 또는 폐기물이 화면에 안 보임.",
    },
}


# 실제 backend 가 보내는 evidence_type 은 "PIC1", "PIC2" 같은 짧은 표준 코드.
# 같은 PIC2 라도 job_cd 가 R0008 이면 "중간 물떼기 시작", RD001 이면 "바이오차 포대" 등
# 의미가 다르기 때문에 (job_cd, evidence_type) 튜플로 PHOTO_CRITERIA 키 매핑.
JOB_EVIDENCE_TO_CRITERIA: dict[tuple[str, str], str] = {
    # 신 시드 — 논농사 (R series)
    ("R0008", "PIC2"): "MID_DRAINAGE_START",
    ("R0008", "PIC1"): "MID_DRAINAGE_END",
    ("R0009", "PIC2"): "AWD_DRY_FIELD_ROUND_1",
    ("R0009", "PIC1"): "AWD_DRY_FIELD_ROUND_2",
    ("R0010", "PIC1"): "AWD_DRY_FIELD",
    # 신 시드 — 논밭 (RD series)
    ("RD001", "PIC2"): "BIOCHAR_BAG",
    ("RD001", "PIC1"): "BIOCHAR_SPREADING",
    ("RD002", "PIC2"): "AUTUMN_TILLAGE_BEFORE",
    ("RD002", "PIC1"): "AUTUMN_TILLAGE_AFTER",
    # 신 시드 — 농사일반 (A series)
    ("A0005", "PIC1"): "WASTE_COLLECTION",
    # 옛 식별자 호환 (v0_farmer 옛 호출)
    ("WATER_DN", "PIC2"): "MID_DRAINAGE_START",
    ("WATER_DN", "PIC1"): "MID_DRAINAGE_END",
    ("SHALLOW", "PIC2"): "AWD_DRY_FIELD_ROUND_1",
    ("BIOCHAR", "PIC2"): "BIOCHAR_BAG",
    ("BIOCHAR", "PIC1"): "BIOCHAR_SPREADING",
    ("FALL_TILLAGE", "PIC2"): "AUTUMN_TILLAGE_BEFORE",
    ("FALL_TILLAGE", "PIC1"): "AUTUMN_TILLAGE_AFTER",
    ("WASTE", "PIC1"): "WASTE_COLLECTION",
}


def _resolve_criteria_key(job_cd: str | None, evidence_type: str | None) -> str | None:
    """(job_cd, evidence_type) → PHOTO_CRITERIA 키 매핑.
    먼저 (job, ev) 정확 매칭, 없으면 evidence_type 자체로 fallback (옛 호출 호환)."""
    if evidence_type:
        ev = evidence_type.upper()
        if job_cd:
            key = JOB_EVIDENCE_TO_CRITERIA.get((job_cd.upper(), ev))
            if key:
                return key
        # frontend 가 이미 정확한 코드(MID_DRAINAGE_START 등) 를 보낸 경우.
        if ev in PHOTO_CRITERIA:
            return ev
    return None


def _build_pic_criteria_block(job_cd: str | None, evidence_type: str | None) -> str:
    """(job_cd, evidence_type) → PHOTO_CRITERIA 가 있으면 prompt 에 prepend 할 짧은 블록."""
    key = _resolve_criteria_key(job_cd, evidence_type)
    if not key:
        return ""
    crit = PHOTO_CRITERIA.get(key)
    if not crit:
        return ""
    return (
        "\n\n[참고 — 이번에 찍는 게 무엇인지 (시행지침 9p)]\n"
        f"증빙명: {crit['title']}\n"
        f"이런 모습: {crit['ok']}\n"
        "위 내용은 message 를 더 친절히 적기 위한 **참고용**일 뿐입니다.\n"
        "세부 기준(회차·단계·정확도)에 못 미친다고 wait 를 주지 마세요 — 정밀 판정은 촬영 후에 따로 합니다.\n"
        "바깥 농사 장면이 보이면 ok 로 두고, message 로만 부드럽게 안내하세요.\n"
        "**message 는 전문 용어 (배수물꼬, 2~5cm, 경운, 바이오차, 비료생산업 등) 를\n"
        "그대로 쓰지 말고, 60-80대 어르신께 들리는 쉬운 일상 말로 풀어쓰세요.**\n"
        "예: '배수물꼬가 개방되었나요?' (X) → '물 빠지는 길이 열려 있네요' (O)\n"
        "    '2~5cm 깊이로' (X) → '발목보다 얕게' (O)\n"
        "    '경운 완료' (X) → '흙이 잘 갈렸어요' (O)"
    )


def coach_photo(
    image_bytes: bytes,
    content_type: str = "image/jpeg",
    evidence_type: str | None = None,
    job_cd: str | None = None,
) -> dict[str, Any]:
    """라이브 카메라 frame 1장 → 짧은 한국어 코칭 메시지.

    응답:
      {kind, status: "ok"|"adjust"|"wait", message, can_capture}

    실패 시 AIServiceError raise. 호출자(프런트 폴링) 가 swallow 권장 — 한 frame 실패가
    다음 frame 시도를 막지 않도록.
    """
    system_prompt, kind = _select_coach_prompt(evidence_type)
    # PIC 케이스만 evidence_type 별 정확 기준을 prompt 에 prepend.
    # 같은 PIC 류라도 회차/단계마다 OK 화면이 다름 (예: 중간 물떼기 시작 vs 종료).
    if kind == "photo":
        criteria_block = _build_pic_criteria_block(job_cd, evidence_type)
        if criteria_block:
            system_prompt = system_prompt + criteria_block
    # 라이브 폴링 — detail low + 짧은 응답 (비용 ↓, 응답속도 ↑).
    # 폴링 모델은 provider 설정 가능(기본 gemini-2.5-flash-lite). 전송 전 512px 축소.
    client, model, provider = _get_coach_client_and_model()
    poll_bytes, poll_ctype = _resize_for_send(image_bytes, content_type, max_side=512, quality=70)
    image_b64 = base64.b64encode(poll_bytes).decode("ascii")

    kwargs: dict[str, Any] = dict(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "지금 이 화면을 짧게 코칭해 주세요."},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{poll_ctype};base64,{image_b64}",
                            "detail": "low",
                        },
                    },
                ],
            },
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    if provider == "gemini":
        # Gemini flash 계열은 thinking 기본 ON → max_tokens 작으면 빈 응답. thinking off + 토큰 200 (라이브 레이턴시 단축).
        kwargs["max_tokens"] = int(os.getenv("COACH_MAX_TOKENS", "200") or "200")
        kwargs["extra_body"] = {"reasoning_effort": "none"}
    else:
        kwargs["max_tokens"] = 80

    try:
        resp = client.chat.completions.create(**kwargs)
        raw = (resp.choices[0].message.content or "").strip()
        data = _extract_first_json_object(raw)  # 코드펜스/잡텍스트 섞여도 첫 JSON 추출
    except AIServiceError:
        raise
    except Exception as e:  # noqa: BLE001
        raise AIServiceError(f"Vision coach 호출 실패: {e}", status_code=503) from e

    status = str(data.get("status") or "wait").lower()
    if status not in ("ok", "adjust", "wait"):
        status = "wait"
    message = str(data.get("message") or "").strip() or (
        "잘 보여요. 찍어 주세요" if status == "ok"
        else "조금 더 가까이 가 주세요" if status == "adjust"
        else "준비해 주세요"
    )
    return {
        "kind": kind,
        "status": status,
        "message": message,
        "can_capture": bool(data.get("can_capture")) or status == "ok",
    }


# ============================================================
# 촬영 후 To-do 일치 판정 — 셔터 후 캡처 1장으로 "이 작업의 증빙이 맞는지" O/X.
# 라이브 폴링(코칭)은 관대한 안내, 여기가 진짜 판정. gemini-2.5-flash(thinking off).
# 확신 낮으면 막지 않고 needs_chief_verification 으로 이장님 확인 유도(원칙: AI는 조언).
# ============================================================

_VERDICT_SYSTEM = """당신은 농촌 저탄소 영농 증빙 사진을 검수하는 엄정한 심사자입니다.
농가가 '특정 작업(To-do)'의 증빙으로 사진 한 장을 제출했습니다. 이 사진이 그 작업의 증빙으로 맞는지 판정하세요.
다음 JSON 만 출력하세요. 설명/주석 금지.

{
  "match": "O" | "UNCERTAIN" | "X",
  "confidence": 0.0~1.0,
  "reason": string
}

판정 기준:
- "O"         — 사진 내용이 그 작업의 증빙으로 분명히 맞음.
- "UNCERTAIN" — 맞는 것 같지만 확신이 어려움(가려짐·모호·부분만 보임·근거 부족).
- "X"         — 그 작업과 분명히 다른 사진(다른 활동, 실내, 무관한 장면 등).
- confidence  — 판정 확신도 0~1.
- reason      — 한국어 한 문장. 60-80대 어르신·이장님이 이해할 쉬운 말. 전문용어 지양.
주의: 흐림·기울어짐·평평하지 않음 같은 '촬영 품질'은 판정 사유가 아닙니다(품질은 따로 봄).
오직 '내용이 그 작업의 증빙이 맞는가'만 보세요. 애매하면 X 대신 UNCERTAIN 을 쓰세요.
"""


def judge_todo_match(
    image_bytes: bytes,
    *,
    content_type: str = "image/jpeg",
    job_cd: str | None = None,
    job_name: str = "",
    activity_name: str = "",
    evidence_type: str | None = None,
    required_evidence_types: list[str] | None = None,
) -> dict[str, Any]:
    """촬영 후 1회: 이 사진이 '이 작업(To-do)'의 증빙으로 맞는지 판정.

    반환: {"match": "O"|"UNCERTAIN"|"X", "confidence": 0.0~1.0, "reason": str}
    어떤 실패에도 raise 하지 않고 안전기본값을 돌려줘 업로드를 막지 않는다.
    """
    safe_default = {"match": "UNCERTAIN", "confidence": 0.0, "reason": ""}
    try:
        ctx_lines: list[str] = []
        if job_name:
            ctx_lines.append(f"작업 이름: {job_name}")
        if activity_name and activity_name != job_name:
            ctx_lines.append(f"활동: {activity_name}")
        if required_evidence_types:
            ctx_lines.append(f"필요 증빙 종류: {', '.join(required_evidence_types)}")
        # 시행지침 참고 기준(있으면) 재사용 — '무엇을 찍는지' 맥락.
        criteria = _build_pic_criteria_block(job_cd, evidence_type)
        ctx = "\n".join(ctx_lines) if ctx_lines else "(작업 정보 없음)"
        user_text = (
            f"[이 작업의 정보]\n{ctx}\n{criteria}\n\n"
            "위 작업의 증빙으로 이 사진이 맞는지 판정해 JSON 으로만 답하세요."
        )

        client, model, provider = _get_verdict_client_and_model()
        v_bytes, v_ctype = _resize_for_send(image_bytes, content_type, max_side=768, quality=80)
        image_b64 = base64.b64encode(v_bytes).decode("ascii")

        kwargs: dict[str, Any] = dict(
            model=model,
            messages=[
                {"role": "system", "content": _VERDICT_SYSTEM},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text},
                        {"type": "image_url", "image_url": {
                            "url": f"data:{v_ctype};base64,{image_b64}", "detail": "high"}},
                    ],
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        if provider == "gemini":
            kwargs["max_tokens"] = int(os.getenv("TODO_MATCH_MAX_TOKENS", "512") or "512")
            kwargs["extra_body"] = {"reasoning_effort": "none"}  # thinking off
        else:
            kwargs["max_tokens"] = 200

        resp = client.chat.completions.create(**kwargs)
        raw = (resp.choices[0].message.content or "").strip()
        data = _extract_first_json_object(raw)
    except Exception:  # noqa: BLE001 — 판정 실패가 업로드를 막지 않도록 안전 폴백
        return safe_default

    match = str(data.get("match") or "UNCERTAIN").strip().upper()
    if match not in ("O", "UNCERTAIN", "X"):
        match = "UNCERTAIN"
    try:
        conf = float(data.get("confidence"))
    except (TypeError, ValueError):
        conf = 0.0
    conf = max(0.0, min(1.0, conf))
    return {"match": match, "confidence": conf, "reason": str(data.get("reason") or "").strip()}


def _to_number(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        # "12,300원" → 12300
        cleaned = "".join(c for c in value if c.isdigit() or c == ".")
        try:
            return float(cleaned) if cleaned else 0.0
        except ValueError:
            return 0.0
    return 0.0


def _to_string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(v) for v in value if v][:5]
    return []
