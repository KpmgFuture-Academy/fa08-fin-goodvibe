"""시연용 evidence 사진 AI 생성 + Supabase Storage 업로드.

OpenAI Images API (gpt-image-1) 로 한국 논·바이오차·영수증 등 시연용 사진을 생성하고,
backend 의 evidence_storage.upload_bytes 함수로 Supabase Storage 의 evidence bucket 에
업로드한다.

업로드 path 는 transactions_demo.sql / chief_demo_seed.sql 의 evidence.file_path 와 정확히
매칭되도록 ``uploads/evidence/{filename}`` 형태로 둠. 그러면 frontend 의 `resolveImageUrl()`
이 자동으로 public URL 로 변환.

사용법:
    cd locaville/backend
    .\\.venv\\Scripts\\python.exe scripts/generate_demo_photos.py

선택 옵션:
    --dry-run         이미지 생성만 하고 로컬 저장 (Storage 업로드 skip)
    --skip-generate   이미 demo_photos/ 폴더에 파일 있으면 OpenAI 호출 skip 하고 업로드만
    --only KEY        특정 key 1개만 (디버깅)

비용 추정: gpt-image-1 1024x1024 standard quality ≈ $0.04/장. 6장 ≈ $0.25.

전제:
  - backend 의 .env 에 OPENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY 설정
  - chief_demo_seed.sql 적용 후 (evidence row 들의 file_path 와 매핑됨)
  - Supabase Storage 의 evidence bucket public 설정
"""

from __future__ import annotations

import argparse
import base64
import os
import sys
from pathlib import Path

# backend 의 .env 로드 — OPENAI_API_KEY, SUPABASE_* 등.
# 이 script 는 backend/scripts/ 안에 있으므로 backend 디렉토리 상대 import 가능.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)


# ============================================================
# 생성할 사진 목록 — chief_demo_seed.sql + transactions_demo.sql 의 evidence.file_path 와 매칭
# ============================================================
PROMPTS: list[dict[str, str]] = [
    {
        "key": "demo_water_start",
        "filename": "demo_water_start.jpg",
        "purpose": "김영수 6/27 중간 물떼기 시작 — transactions_demo.sql 의 evidence",
        "prompt": (
            "Photo of a Korean rice paddy field one month after rice planting. "
            "Side water gate (mulgo) is open and water is draining out. "
            "Young rice plants about 30cm tall, vivid green. "
            "Natural sunlight, casual smartphone-like composition by a farmer. "
            "No people in frame, no text overlay. Hyperrealistic."
        ),
    },
    {
        "key": "demo_water_end",
        "filename": "demo_water_end.jpg",
        "purpose": "김영수 7/11 중간 물떼기 완료 — transactions_demo.sql 의 evidence",
        "prompt": (
            "Photo of a Korean rice paddy with cracked dry soil after 14 days of "
            "mid-season drainage (jung-gan-mul-tte-gi). Soil cracked like turtle "
            "shell pattern, with green rice plants still standing tall. Bright "
            "afternoon sunlight, casual farmer smartphone-style composition. "
            "No people, no text overlay. Hyperrealistic."
        ),
    },
    {
        "key": "demo_biochar_blur",
        "filename": "demo_biochar_blur.jpg",
        "purpose": "박정호 5/20 바이오차 — chief_demo_seed.sql, retake_required",
        "prompt": (
            "Slightly blurry, low-quality smartphone photo of a Korean rice paddy "
            "with small amount of black biochar powder scattered on the edge. "
            "The biochar amount is hard to assess from this angle — no bag or "
            "container visible. Soft focus, somewhat dim lighting. Casual "
            "farmer-style composition. No people, no text overlay."
        ),
    },
    {
        "key": "demo_biochar_ok",
        "filename": "demo_biochar_ok.jpg",
        "purpose": "박정호 바이오차 재촬영본 — 시연 시 농민이 다시 찍은 사진",
        "prompt": (
            "Clear sharp photo of a Korean rice paddy with black biochar powder "
            "evenly spread on the soil. A black plastic biochar bag is placed "
            "next to it for scale (no Korean text visible — plain bag). Bright "
            "daylight, well-composed smartphone photo by a farmer. Amount of "
            "biochar clearly visible. No people, no text overlay. Hyperrealistic."
        ),
    },
    {
        "key": "demo_seedling",
        "filename": "demo_seedling.jpg",
        "purpose": "김영수 5/27 모내기 — transactions_demo.sql 보조 시각",
        "prompt": (
            "Photo of freshly transplanted rice seedlings in a Korean paddy field. "
            "Young rice plants 10-15cm tall in neat rows, water level high covering "
            "the soil. Spring afternoon light, calm reflection on water. Casual "
            "farmer smartphone photo. No people, no text overlay. Hyperrealistic."
        ),
    },
    {
        "key": "demo_fertilizer_bag",
        "filename": "demo_fertilizer_bag.jpg",
        "purpose": "박정호 5/15 비료 살포 — transactions_demo.sql 보조 시각",
        "prompt": (
            "Photo of a complex fertilizer bag (white woven plastic, generic) "
            "placed at the edge of a Korean rice paddy with freshly applied "
            "fertilizer scattered on the soil. Bright morning light. Casual "
            "farmer smartphone composition. No people, no Korean text visible "
            "on bag — plain white. Hyperrealistic."
        ),
    },
]


# ============================================================
# OpenAI 이미지 생성
# ============================================================
def generate_image(prompt: str, out_path: Path) -> None:
    """OpenAI Images API 호출 → 로컬 파일 저장."""
    from openai import OpenAI

    client = OpenAI()
    resp = client.images.generate(
        model="gpt-image-1",
        prompt=prompt,
        size="1024x1024",
        n=1,
    )
    b64 = resp.data[0].b64_json
    if not b64:
        raise RuntimeError("OpenAI 응답에 b64_json 없음")
    data = base64.b64decode(b64)
    out_path.write_bytes(data)


# ============================================================
# Supabase Storage 업로드 — backend 의 기존 함수 reuse
# ============================================================
def upload_to_storage(local_path: Path, storage_key: str) -> str:
    """파일 bytes → Supabase Storage 업로드. public URL 반환."""
    from app.repositories.evidence_storage import upload_bytes

    data = local_path.read_bytes()
    result = upload_bytes(key=storage_key, data=data, content_type="image/jpeg", upsert=True)
    return result["public_url"]


# ============================================================
# main
# ============================================================
def main() -> None:
    ap = argparse.ArgumentParser(description="시연용 evidence 사진 생성 + Storage 업로드")
    ap.add_argument("--dry-run", action="store_true", help="로컬 생성만, Storage 업로드 skip")
    ap.add_argument(
        "--skip-generate",
        action="store_true",
        help="이미 demo_photos/ 에 파일 있으면 OpenAI 호출 skip",
    )
    ap.add_argument("--only", type=str, default="", help="특정 key 1개만")
    args = ap.parse_args()

    out_dir = Path(__file__).resolve().parents[1] / "demo_photos"
    out_dir.mkdir(exist_ok=True)

    targets = [p for p in PROMPTS if not args.only or p["key"] == args.only]
    if not targets:
        print(f"--only={args.only} 매칭 안 됨. 가능한 key:")
        for p in PROMPTS:
            print(f"  - {p['key']}")
        sys.exit(1)

    print(f"=== 시연용 사진 생성: {len(targets)} 개 ===\n")

    for item in targets:
        key = item["key"]
        filename = item["filename"]
        purpose = item["purpose"]
        prompt = item["prompt"]
        local_path = out_dir / filename

        print(f"[{key}] {purpose}")

        # 1) 생성 (혹은 skip)
        if args.skip_generate and local_path.exists():
            print(f"  -> 이미 존재: {local_path} (생성 skip)")
        else:
            print("  -> OpenAI 이미지 생성 중 ...")
            try:
                generate_image(prompt, local_path)
                print(f"  -> 로컬 저장: {local_path}")
            except Exception as exc:  # noqa: BLE001
                print(f"  !! 생성 실패: {exc}")
                continue

        # 2) Storage 업로드
        if args.dry_run:
            print("  -> --dry-run: Storage 업로드 skip")
        else:
            storage_key = f"uploads/evidence/{filename}"
            try:
                url = upload_to_storage(local_path, storage_key)
                print(f"  -> Storage: {storage_key}")
                print(f"     public URL: {url}")
            except Exception as exc:  # noqa: BLE001
                print(f"  !! 업로드 실패: {exc}")
                continue

        print()

    print("=== 완료 ===")
    print("\nevidence.file_path 와 매핑된 storage path:")
    for item in targets:
        print(f"  uploads/evidence/{item['filename']}")


if __name__ == "__main__":
    main()
