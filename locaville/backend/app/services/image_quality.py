"""사진 증빙 품질 검사 (블러/밝기/해상도).

notebook 실험(`notebook/chp_poc_experiment.ipynb`)의 임계값을 backend 로 이식:
  - 블러:   Laplacian variance < 80  → 흐림/흔들림
  - 밝기:   grayscale mean   < 45   → 너무 어두움
  - 해상도: width < 512 또는 height < 384 → 저해상도

엔진 우선순위:
  1) OpenCV(cv2) 가 있으면 cv2.Laplacian 기반 (정확)
  2) 없으면 numpy + Pillow 로 그래디언트 분산 폴백 (대략적이지만 동작 보장)
  3) 둘 다 불가하면 검사를 건너뛰고 passed=True (업로드를 막지 않음)

이 모듈은 어떤 경우에도 예외를 올리지 않습니다 — 품질검사 실패가 업로드 자체를
막으면 안 되기 때문입니다. 결과의 ``passed``/``issues`` 로만 신호를 줍니다.
"""
from __future__ import annotations

import io
from typing import Any

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None  # type: ignore

try:
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None  # type: ignore

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None  # type: ignore


# notebook 에서 검증한 임계값 (그대로 이식)
BLUR_VAR_THRESHOLD = 80.0       # cv2.Laplacian variance
BLUR_FALLBACK_THRESHOLD = 30.0  # numpy gradient variance (cv2 없을 때)
BRIGHTNESS_MIN = 45.0           # grayscale mean (0–255)
MIN_WIDTH = 512
MIN_HEIGHT = 384


def _empty_result(reason: str = "") -> dict[str, Any]:
    """검사 불가(라이브러리 없음) 시: 업로드를 막지 않도록 passed=True."""
    return {
        "engine": "none",
        "checked": False,
        "passed": True,
        "blur_score": None,
        "brightness": None,
        "width": None,
        "height": None,
        "issues": [],
        "note": reason,
    }


def check_image_quality(file_bytes: bytes) -> dict[str, Any]:
    """이미지 바이트의 품질을 검사해서 dict 로 반환.

    반환 키:
      engine     : "opencv" | "numpy" | "none"
      checked    : 실제 검사 수행 여부
      passed     : 모든 항목 통과 여부 (false 면 issues 에 사유)
      blur_score : 선명도 점수 (높을수록 선명). 엔진별 스케일 다름.
      brightness : 평균 밝기 (0–255)
      width/height
      issues     : ["BLURRY_IMAGE", "TOO_DARK", "LOW_IMAGE_QUALITY"] 중 위반 항목
    """
    if not file_bytes:
        return _empty_result("empty file bytes")

    # --- OpenCV 경로 (정확) ---
    if cv2 is not None and np is not None:
        try:
            arr = np.frombuffer(file_bytes, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is None:
                return _empty_result("cv2 could not decode image")
            height, width = img.shape[:2]
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            brightness = float(gray.mean())
            return _evaluate(
                engine="opencv",
                blur_score=blur_score,
                blur_threshold=BLUR_VAR_THRESHOLD,
                brightness=brightness,
                width=int(width),
                height=int(height),
            )
        except Exception:  # noqa: BLE001
            # cv2 처리 실패 시 numpy 폴백으로
            pass

    # --- numpy + Pillow 폴백 (대략적) ---
    if np is not None and Image is not None:
        try:
            with Image.open(io.BytesIO(file_bytes)) as im:
                im = im.convert("L")  # grayscale
                width, height = im.size
                gray = np.asarray(im, dtype=np.float64)
            brightness = float(gray.mean())
            # 그래디언트 분산으로 선명도 근사
            gx = np.diff(gray, axis=1)
            gy = np.diff(gray, axis=0)
            blur_score = float((gx.var() + gy.var()) / 2.0)
            return _evaluate(
                engine="numpy",
                blur_score=blur_score,
                blur_threshold=BLUR_FALLBACK_THRESHOLD,
                brightness=brightness,
                width=int(width),
                height=int(height),
            )
        except Exception:  # noqa: BLE001
            return _empty_result("numpy/PIL fallback failed")

    return _empty_result("no image library available")


def _evaluate(
    *,
    engine: str,
    blur_score: float,
    blur_threshold: float,
    brightness: float,
    width: int,
    height: int,
) -> dict[str, Any]:
    """측정값 → 통과 여부 + 위반 항목 리스트."""
    issues: list[str] = []
    if blur_score < blur_threshold:
        issues.append("BLURRY_IMAGE")
    if brightness < BRIGHTNESS_MIN:
        issues.append("TOO_DARK")
    if width < MIN_WIDTH or height < MIN_HEIGHT:
        issues.append("LOW_IMAGE_QUALITY")
    return {
        "engine": engine,
        "checked": True,
        "passed": len(issues) == 0,
        "blur_score": round(blur_score, 2),
        "brightness": round(brightness, 2),
        "width": width,
        "height": height,
        "issues": issues,
    }


def quality_message(result: dict[str, Any]) -> str:
    """품질 결과를 농가용 한국어 안내 문구로."""
    if not result.get("checked"):
        return ""
    if result.get("passed"):
        return "사진 품질이 양호합니다."
    issues = result.get("issues") or []
    parts: list[str] = []
    if "BLURRY_IMAGE" in issues:
        parts.append("사진이 흐리거나 흔들렸습니다")
    if "TOO_DARK" in issues:
        parts.append("사진이 너무 어둡습니다")
    if "LOW_IMAGE_QUALITY" in issues:
        parts.append("해상도가 낮습니다")
    if not parts:
        return "사진 품질을 확인해 주세요."
    return ", ".join(parts) + ". 더 밝고 선명하게 다시 찍어 주시면 좋습니다."
