"""L6 Senior UX — 시니어(60-80대) 농민 대상 UI 정량 회귀 검증.

저탄마을 4-Level 테스트의 Level 6. 자동 ~50% (CSS 정적 분석), 수동 ~50% (실 시연).

자동 영역 — globals.css 정적 검증:
  L6.1 baseline 폰트     — 본문 ≥15px (앱별 권장: 농민 ≥17px / 이장·관리자 ≥15px)
  L6.2 큰 글자 모드      — body[data-large-text] 룰 존재 + baseline 보다 큼
  L6.3 버튼 사이즈 정의 — .btn-sm/-md/-lg 의 font-size + padding 명시
  L6.4 색 토큰 존재     — --bg / --text 등 변수 정의 (대비 측정 자체는 수동 도구)

수동 영역은 [`docs/dev/test-scenarios.md`](../../docs/dev/test-scenarios.md) 의 L6 섹션 참고.

실행:
    cd locaville/backend
    .\\.venv\\Scripts\\python -m pytest tests/test_l6_senior_ux.py -v
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[1]
LOCAVILLE_ROOT = BACKEND_ROOT.parent


# ============================================================
# 헬퍼 — globals.css 로드 + 정규식 추출
# ============================================================


def _read_globals(app_dir: str) -> str:
    path = LOCAVILLE_ROOT / app_dir / "app" / "globals.css"
    if not path.exists():
        pytest.skip(f"{app_dir} globals.css 없음 — frontend 디렉토리 확인")
    return path.read_text(encoding="utf-8", errors="ignore")


def _extract_baseline_font_size(css: str) -> int | None:
    """`html { font-size: NNpx }` / `body { font-size: NNpx }` / `body { font-size: var(--X) }` 처리.

    `var(--name)` 참조면 `:root { --name: NNpx }` 정의를 추적해서 값 해석.
    """
    # 1) html / body 의 명시적 NNpx
    for selector in ("html", "body", r"html\s*,\s*body"):
        m = re.search(
            rf"\b{selector}\s*\{{[^}}]*font-size:\s*(\d+)px",
            css,
            re.DOTALL,
        )
        if m:
            return int(m.group(1))

    # 2) html/body 가 var(--xxx) 참조하면 그 변수 값 해석
    for selector in ("html", "body", r"html\s*,\s*body"):
        m = re.search(
            rf"\b{selector}\s*\{{[^}}]*font-size:\s*var\(\s*(--[a-zA-Z0-9_-]+)\s*\)",
            css,
            re.DOTALL,
        )
        if m:
            var_name = m.group(1)
            var_match = re.search(rf"{re.escape(var_name)}\s*:\s*(\d+)px", css)
            if var_match:
                return int(var_match.group(1))
    return None


def _has_large_text_mode(css: str) -> bool:
    """body[data-large-text] 또는 body[data-large-text="1"|"2"] 셀렉터 존재."""
    return bool(re.search(r"body\[data-large-text(?:=\"?[12]\"?)?\]", css))


def _large_text_baseline(css: str) -> int | None:
    """data-large-text 모드의 base font-size."""
    m = re.search(
        r"body\[data-large-text(?:=\"?1?\"?)?\]\s*\{[^}]*font-size:\s*(\d+)px",
        css,
        re.DOTALL,
    )
    return int(m.group(1)) if m else None


def _has_button_size_classes(css: str) -> dict[str, bool]:
    """.btn-sm/-md/-lg 셀렉터가 globals.css 에 정의되어 있는지."""
    return {
        size: bool(re.search(rf"\.btn-{size}\b\s*\{{", css))
        for size in ("sm", "md", "lg")
    }


def _btn_lg_font_size(css: str) -> int | None:
    m = re.search(r"\.btn-lg\b\s*\{[^}]*font-size:\s*(\d+)px", css, re.DOTALL)
    return int(m.group(1)) if m else None


def _has_color_tokens(css: str) -> bool:
    """`--bg` + 텍스트 색 토큰 (`--text` 또는 `--ink` — 디자인 시스템 컨벤션) 정의 존재."""
    has_bg = bool(re.search(r"--bg\s*:", css))
    has_text_token = bool(re.search(r"--(text|ink)\s*:", css))
    return has_bg and has_text_token


# ============================================================
# L6.1 — baseline 폰트
# ============================================================


def test_l6_1_app_user_baseline_font_for_seniors() -> None:
    """농민 앱 — 60-80대 대상이므로 baseline 폰트 ≥ 17px 권장."""
    css = _read_globals("app_user")
    size = _extract_baseline_font_size(css)
    assert size is not None, "app_user globals.css 에 html/body font-size baseline 없음"
    assert size >= 17, (
        f"농민 앱 baseline 폰트 {size}px — 시니어 권장 17px 미만. "
        f"AGENTS.md §5: 본문 ≥15px (농민 앱은 +2px 시니어 가산 권장)"
    )


def test_l6_2_web_user_baseline_font() -> None:
    """이장 대시보드 — baseline ≥ 15px (AGENTS.md §5)."""
    css = _read_globals("web_user")
    size = _extract_baseline_font_size(css)
    assert size is not None, "web_user globals.css 에 baseline 폰트 정의 없음"
    assert size >= 15, f"이장 대시보드 baseline {size}px < 15px"


def test_l6_3_web_admin_baseline_font() -> None:
    """관리자 — baseline ≥ 14px (관리자는 시니어 가정 약함)."""
    css = _read_globals("web_admin")
    size = _extract_baseline_font_size(css)
    assert size is not None, "web_admin globals.css 에 baseline 폰트 정의 없음"
    assert size >= 14, f"관리자 baseline {size}px < 14px"


# ============================================================
# L6.2 — 큰 글자 모드 (data-large-text)
# ============================================================


def test_l6_4_app_user_has_large_text_mode() -> None:
    """농민 앱 — body[data-large-text] 룰 존재 + baseline 보다 큼."""
    css = _read_globals("app_user")
    assert _has_large_text_mode(css), (
        "app_user 에 data-large-text 모드 없음 — 시니어 글자 키우기 기능 누락"
    )
    base = _extract_baseline_font_size(css) or 16
    large = _large_text_baseline(css)
    assert large is not None, "body[data-large-text] 의 font-size 정의 누락"
    assert large >= base, (
        f"큰 글자 모드 폰트 {large}px ≤ baseline {base}px — 모드가 의미 없음"
    )


def test_l6_5_web_user_has_large_text_mode() -> None:
    css = _read_globals("web_user")
    assert _has_large_text_mode(css), (
        "web_user 에 data-large-text 모드 없음 — 이장님도 시니어 가능성"
    )


# ============================================================
# L6.3 — 버튼 사이즈 클래스 정의
# ============================================================


def test_l6_6_web_user_has_button_size_system() -> None:
    """web_user globals.css 에 .btn-sm/-md/-lg 세 사이즈 시스템 모두 정의."""
    css = _read_globals("web_user")
    sizes = _has_button_size_classes(css)
    missing = [size for size, present in sizes.items() if not present]
    assert not missing, f"web_user 의 button 사이즈 정의 누락: {missing}"


def test_l6_7_web_admin_has_button_size_system() -> None:
    css = _read_globals("web_admin")
    sizes = _has_button_size_classes(css)
    missing = [size for size, present in sizes.items() if not present]
    assert not missing, f"web_admin 의 button 사이즈 정의 누락: {missing}"


def test_l6_8_web_user_btn_lg_font_size_readable() -> None:
    """btn-lg 의 폰트 ≥ 17px (시니어 권장)."""
    css = _read_globals("web_user")
    size = _btn_lg_font_size(css)
    assert size is not None, "web_user .btn-lg 의 font-size 정의 없음"
    assert size >= 17, f".btn-lg font {size}px — 시니어 권장 17px 미만"


# ============================================================
# L6.4 — 색 토큰 시스템
# ============================================================


def test_l6_9_app_user_has_color_tokens() -> None:
    """디자인 토큰 (--bg / --text) 존재 — 추후 색대비 측정/다크모드 기반."""
    css = _read_globals("app_user")
    assert _has_color_tokens(css), (
        "app_user 에 --bg / --text 토큰 누락 — 색상이 inline 으로 박혀있을 위험"
    )


def test_l6_10_web_user_has_color_tokens() -> None:
    css = _read_globals("web_user")
    assert _has_color_tokens(css), (
        "web_user 에 --bg / --text 토큰 누락"
    )


def test_l6_11_web_admin_has_color_tokens() -> None:
    css = _read_globals("web_admin")
    assert _has_color_tokens(css), (
        "web_admin 에 --bg / --text 토큰 누락"
    )
