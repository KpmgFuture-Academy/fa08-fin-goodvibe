#!/usr/bin/env python
"""gen_test_images.py — 사진 코칭 오판율 테스트용 '명확한 케이스' 이미지 생성.

진짜 농가 사진 구하기가 어려워서, **구분이 거칠어 생성 모델이 틀리기 어려운 케이스만**
gpt-image-1 로 생성한다. (물꼬 개방/바이오차 같은 미묘한 장면은 생성 신뢰도가 낮아 제외 —
그건 실제/기존 사진 라벨링으로 커버.)

각 항목은 (생성 의도 = ground truth label) 을 같이 들고 있어, manifest 행으로 바로 출력.
생성 결과는 사람이 한 번 눈으로 보고 의도와 맞는 것만 남길 것.

사용:
    python tools/gen_test_images.py --out ./test_photos
환경변수(backend/.env 자동 로드): OPENAI_API_KEY
"""
from __future__ import annotations

import argparse
import base64
import csv
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]

# (파일명, 생성 프롬프트, job_cd, evidence_type, expected)
PROMPTS = [
    # ── 명백한 negative (wait): 장면 자체가 요구와 어긋남 ──
    ("gen_indoor_livingroom", "A photo taken inside a Korean home living room, sofa, TV, indoor lighting, no farmland anywhere, realistic smartphone photo", "R0008", "PIC2", "wait"),
    ("gen_city_street", "A busy Korean city street with cars, shops and tall buildings, daytime, realistic smartphone photo, no farmland", "R0008", "PIC2", "wait"),
    ("gen_flooded_paddy", "A Korean rice paddy field completely flooded with deep standing water, lush green rice plants growing, sunny day, realistic smartphone photo", "R0008", "PIC2", "wait"),
    # ── 명백한 positive (ok) ──
    ("gen_dry_cracked_paddy", "An empty Korean rice paddy field with dry cracked bare soil, no standing water at all, sunny clear day, realistic smartphone photo taken standing at the edge of the field", "R0008", "PIC2", "ok"),
    ("gen_drained_muddy_paddy", "A Korean rice paddy with the water drained away, wet muddy bare bottom, no rice plants, realistic smartphone photo of farmland", "R0009", "PIC2", "ok"),
    ("gen_autumn_tillage_after", "A Korean farm field right after plowing, rough overturned dark brown soil in clumps, no crops, autumn, realistic smartphone photo", "RD002", "PIC1", "ok"),
    ("gen_waste_pile", "A pile of collected farm waste in a field: empty pesticide bottles, used plastic mulch film and fertilizer sacks gathered in one spot, realistic smartphone photo", "A0005", "PIC1", "ok"),
    ("gen_receipt_clear", "A flat, well-lit close-up photo of a Korean agricultural supply store paper receipt with clear Hangul text, listing fertilizer items and a total amount, lying flat on a table", "", "RCT", "ok"),
    ("gen_certificate_clear", "A flat well-lit photo of a Korean agricultural education completion certificate (이수증) document with clear printed Hangul text and an official seal, on a desk", "", "EDU", "ok"),
    # ── adjust: 맞는 피사체지만 촬영 품질 문제 ──
    ("gen_paddy_far_blurry", "A Korean rice field photographed from very far away, small in frame, slightly out of focus and blurry, tilted horizon, realistic smartphone photo", "R0008", "PIC2", "adjust"),
    ("gen_paddy_too_dark", "A Korean rice paddy field at dusk, very dark and underexposed, hard to see details, realistic smartphone photo", "R0008", "PIC2", "adjust"),
    ("gen_receipt_tilted", "A Korean paper receipt photographed at a steep slanted angle, slightly crumpled with glare from a light, text partially hard to read, realistic smartphone photo", "", "RCT", "adjust"),
]


def _load_env() -> None:
    env_path = BACKEND_ROOT / ".env"
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path, override=False)
        return
    except ImportError:
        pass
    import os
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main() -> int:
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
        except Exception:  # noqa: BLE001
            pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="./test_photos")
    ap.add_argument("--size", default="1024x1024")
    ap.add_argument("--quality", default="low", help="low|medium|high (gpt-image-1)")
    args = ap.parse_args()

    _load_env()
    import os
    from openai import OpenAI
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        print("OPENAI_API_KEY 없음", file=sys.stderr)
        return 1
    client = OpenAI(api_key=key)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for name, prompt, job_cd, ev, expected in PROMPTS:
        fname = f"{name}.png"
        try:
            resp = client.images.generate(
                model="gpt-image-1", prompt=prompt, size=args.size, quality=args.quality, n=1,
            )
            b64 = resp.data[0].b64_json
            (out_dir / fname).write_bytes(base64.b64decode(b64))
            rows.append([fname, job_cd, ev, expected])
            print(f"  ✓ {fname:<28} (의도 라벨 expected={expected}, {job_cd or '-'}/{ev})")
        except Exception as e:  # noqa: BLE001
            print(f"  ! {fname} 생성 실패: {str(e)[:160]}", file=sys.stderr)

    # 생성분 manifest 행 — 최종 manifest 에 합치기 쉽게 별도 CSV 로도 저장.
    gen_csv = out_dir / "gen_rows.csv"
    with gen_csv.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["file", "job_cd", "evidence_type", "expected"])
        w.writerows(rows)
    print(f"\n생성 {len(rows)}장 → {out_dir}")
    print(f"라벨 행: {gen_csv}")
    print("⚠ 생성 이미지는 의도대로 나왔는지 한 번 눈으로 확인 후 사용하세요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
