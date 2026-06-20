#!/usr/bin/env python
"""coach_eval.py — 라이브 사진 코칭 모델 오판율(誤判率) 비교.

실제 운영 프롬프트(app.services.photo_guard_service)를 **그대로** 써서 여러 모델을
같은 라벨링 사진셋에 돌려, 어떤 모델이 덜 틀리는지 비교한다.

핵심 지표:
  - false_OK   : 찍으면 안 되는 화면인데 모델이 "ok" → **컴플라이언스 위험** (부적합 증빙 통과)
  - false_REJ  : 찍어도 되는 화면인데 ok 를 안 줌 → **어르신 UX 위험** (계속 답답)
  - exact      : status 3분류(ok/adjust/wait) 정확 일치율
  - latency    : 평균 응답시간 (실시간 폴링 적합성)
  - cost       : usage 기반 실측 호출당 비용 (모델 단가표 사용)

라벨 manifest (CSV, UTF-8):
    file,job_cd,evidence_type,expected
    drain_open.jpg,R0008,PIC2,ok
    drain_flooded.jpg,R0008,PIC2,wait
    biochar_bag.jpg,RD001,PIC2,ok
    living_room.jpg,R0008,PIC2,wait
  - expected = 그 순간 어르신이 찍어도 되는가: ok | adjust | wait
  - (job_cd, evidence_type) 로 운영과 똑같은 '시행지침 기준 블록'이 프롬프트에 붙는다.
    영수증/이수증을 테스트하려면 evidence_type 에 RCT / EDU 사용.

사용:
  # 1) 라벨 템플릿 생성 — 사진 폴더 스캔 → expected 빈칸 CSV (직접 채워 넣기)
  python tools/coach_eval.py init --photos-dir ./test_photos --out manifest.csv

  # 2) (manifest.csv 의 expected 칸을 다 채운 뒤) 모델 비교 실행
  python tools/coach_eval.py run --manifest manifest.csv --photos-dir ./test_photos

  # 모델 직접 지정 (기본 4종 대신)
  python tools/coach_eval.py run --manifest manifest.csv --models gpt-4.1-mini,gemini-2.5-flash-lite

환경변수 (backend/.env 자동 로드): OPENAI_API_KEY, GEMINI_API_KEY
"""
from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]            # locaville/backend  → app.*
LIBRARY_ROOT = Path(__file__).resolve().parents[2] / "library"  # locaville/library → locaville.dbcom
for p in (str(BACKEND_ROOT), str(LIBRARY_ROOT)):
    if p not in sys.path:
        sys.path.insert(0, p)

# Windows 콘솔(cp949)에서 한글/em-dash 출력이 깨지거나 죽지 않도록 UTF-8 강제.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except Exception:  # noqa: BLE001
        pass

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

# 폴링 프레임 재현용 — 실제 프런트는 quality 0.55 JPEG + detail:low 로 보낸다.
# 풀해상도로 테스트하면 실제보다 후하게 나오므로 같은 화질로 낮춰서 보낸다.
POLL_JPEG_QUALITY = 55

# ── 모델 카탈로그 ───────────────────────────────────────────────
# provider: openai = 기본 엔드포인트, gemini = OpenAI 호환 엔드포인트.
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
MODELS = {
    "gpt-4.1-mini":          {"provider": "openai", "model": "gpt-4.1-mini"},   # 현재 운영
    "gpt-4o-mini":           {"provider": "openai", "model": "gpt-4o-mini"},
    "gemini-2.5-flash-lite": {"provider": "gemini", "model": "gemini-2.5-flash-lite"},
    "gemini-2.5-flash":      {"provider": "gemini", "model": "gemini-2.5-flash"},
    # 키가 지원하면 최신도 추가 가능:
    # "gemini-3.1-flash-lite": {"provider": "gemini", "model": "gemini-3.1-flash-lite"},
}
DEFAULT_MODELS = ["gpt-4.1-mini", "gemini-2.5-flash-lite", "gemini-2.5-flash"]

# $/1M 토큰 (input, output) — 2026-06 기준. 모르는 모델은 비용 생략.
PRICES = {
    "gpt-4.1-mini":          (0.40, 1.60),
    "gpt-4o-mini":           (0.15, 0.60),
    "gemini-2.5-flash-lite": (0.10, 0.40),
    "gemini-2.5-flash":      (0.30, 2.50),
    "gemini-3.1-flash-lite": (0.10, 0.40),
}


def _load_env() -> None:
    """backend/.env 로드 (python-dotenv 있으면 사용, 없으면 수동 파싱)."""
    env_path = BACKEND_ROOT / ".env"
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path, override=False)
        return
    except ImportError:
        pass
    import os
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def _client_for(provider: str):
    """provider 별 OpenAI SDK 클라이언트. Gemini 는 OpenAI 호환 base_url 로."""
    import os
    from openai import OpenAI
    if provider == "gemini":
        key = os.getenv("GEMINI_API_KEY", "").strip()
        if not key:
            raise RuntimeError("GEMINI_API_KEY 가 backend/.env 에 없습니다.")
        return OpenAI(api_key=key, base_url=GEMINI_BASE_URL)
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY 가 backend/.env 에 없습니다.")
    return OpenAI(api_key=key)


def _encode_image(path: Path) -> tuple[str, str]:
    """이미지를 폴링 프레임과 같은 화질(JPEG q55)로 낮춰 (data_uri, content_type) 반환.
    Pillow 없으면 원본 그대로 보냄(+경고)."""
    raw = path.read_bytes()
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(raw))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=POLL_JPEG_QUALITY)
        raw = buf.getvalue()
        ctype = "image/jpeg"
    except ImportError:
        ctype = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
        print("  ! Pillow 미설치 — 원본 화질로 전송 (실제 폴링보다 후하게 나올 수 있음). pip install pillow 권장",
              file=sys.stderr)
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:{ctype};base64,{b64}", ctype


def _coach_once(client, model: str, system_prompt: str, data_uri: str, provider: str = "openai") -> dict:
    """coach_photo 와 동일한 호출 형태 (detail:low, json_object, temp 0.3).

    주의: Gemini 2.5 Flash 는 기본 'thinking' 이 켜져 있어 max_tokens 80 이면 추론 토큰이
    다 먹어 본문이 빈다(=JSON 파싱 실패). gemini 는 thinking 끄고 토큰 여유를 준다.
    → 운영에서 flash 채택 시 coach_photo 도 동일 처리 필요.
    """
    kwargs: dict = dict(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": [
                {"type": "text", "text": "지금 이 화면을 짧게 코칭해 주세요."},
                {"type": "image_url", "image_url": {"url": data_uri, "detail": "low"}},
            ]},
        ],
        response_format={"type": "json_object"},
        max_tokens=80,
        temperature=0.3,
    )
    if provider == "gemini":
        kwargs["max_tokens"] = 400
        kwargs["extra_body"] = {"reasoning_effort": "none"}  # thinking off
    t0 = time.perf_counter()
    resp = client.chat.completions.create(**kwargs)
    latency_ms = (time.perf_counter() - t0) * 1000
    raw = (resp.choices[0].message.content or "").strip()
    data = json.loads(raw)
    status = str(data.get("status") or "wait").lower()
    if status not in ("ok", "adjust", "wait"):
        status = "wait"
    usage = getattr(resp, "usage", None)
    return {
        "status": status,
        "can_capture": bool(data.get("can_capture")) or status == "ok",
        "message": str(data.get("message") or "").strip(),
        "latency_ms": round(latency_ms),
        "prompt_tokens": getattr(usage, "prompt_tokens", 0) or 0,
        "completion_tokens": getattr(usage, "completion_tokens", 0) or 0,
    }


def _build_system_prompt(job_cd: str, evidence_type: str) -> str:
    """운영 코드의 프롬프트 빌더를 그대로 사용 (fidelity 보장)."""
    from app.services.photo_guard_service import _select_coach_prompt, _build_pic_criteria_block
    system_prompt, kind = _select_coach_prompt(evidence_type)
    if kind == "photo":
        block = _build_pic_criteria_block(job_cd or None, evidence_type or None)
        if block:
            system_prompt += block
    return system_prompt


def _read_manifest(manifest: Path) -> list[dict]:
    rows: list[dict] = []
    # 헤더 앞 주석(#) 줄을 먼저 걸러야 DictReader 가 진짜 헤더를 잡는다.
    lines = manifest.read_text(encoding="utf-8-sig").splitlines()
    data_lines = [ln for ln in lines if ln.strip() and not ln.lstrip().startswith("#")]
    for r in csv.DictReader(data_lines):
        if r.get("file"):
            rows.append({
                "file": r["file"].strip(),
                "job_cd": (r.get("job_cd") or "").strip(),
                "evidence_type": (r.get("evidence_type") or "PIC2").strip(),
                "expected": (r.get("expected") or "").strip().lower(),
            })
    return rows


def cmd_init(args) -> int:
    photos_dir = Path(args.photos_dir)
    if not photos_dir.is_dir():
        print(f"사진 폴더가 없습니다: {photos_dir}", file=sys.stderr)
        return 1
    imgs = sorted(p for p in photos_dir.rglob("*") if p.suffix.lower() in IMAGE_EXTS)
    if not imgs:
        print(f"이미지가 없습니다: {photos_dir}", file=sys.stderr)
        return 1
    out = Path(args.out)
    with out.open("w", encoding="utf-8", newline="") as f:
        f.write("# expected 열을 채우세요: ok | adjust | wait\n")
        f.write("# job_cd/evidence_type 예: R0008/PIC2(중간물떼기시작), RD001/PIC2(바이오차포대), */RCT(영수증), */EDU(이수증)\n")
        w = csv.writer(f)
        w.writerow(["file", "job_cd", "evidence_type", "expected"])
        for p in imgs:
            w.writerow([p.relative_to(photos_dir).as_posix(), "", "PIC2", ""])
    print(f"라벨 템플릿 생성: {out}  ({len(imgs)}장)")
    print("→ expected/job_cd/evidence_type 채운 뒤:  python tools/coach_eval.py run --manifest "
          f"{out} --photos-dir {photos_dir}")
    return 0


def cmd_run(args) -> int:
    _load_env()
    manifest = Path(args.manifest)
    photos_dir = Path(args.photos_dir) if args.photos_dir else manifest.parent
    rows = _read_manifest(manifest)
    if not rows:
        print("manifest 에 행이 없습니다.", file=sys.stderr)
        return 1
    missing = [r["file"] for r in rows if not r["expected"]]
    if missing:
        print(f"expected 가 비어있는 행이 {len(missing)}개 있습니다 (예: {missing[:3]}). "
              "정답을 채워야 오판율을 계산할 수 있어요.", file=sys.stderr)
        return 1

    model_keys = (args.models.split(",") if args.models else DEFAULT_MODELS)
    model_keys = [m.strip() for m in model_keys if m.strip()]
    for m in model_keys:
        if m not in MODELS:
            MODELS[m] = {"provider": "gemini" if m.startswith("gemini") else "openai", "model": m}

    # 프롬프트 미리 빌드 (이미지도 한 번만 인코딩해 모델 간 동일 입력 보장)
    print(f"이미지 {len(rows)}장 인코딩 (JPEG q{POLL_JPEG_QUALITY}) ...")
    prepared = []
    for r in rows:
        img_path = photos_dir / r["file"]
        if not img_path.exists():
            print(f"  ! 파일 없음, 건너뜀: {img_path}", file=sys.stderr)
            continue
        data_uri, _ = _encode_image(img_path)
        sysp = _build_system_prompt(r["job_cd"], r["evidence_type"])
        prepared.append({**r, "data_uri": data_uri, "system_prompt": sysp})

    results: list[dict] = []
    for mkey in model_keys:
        cfg = MODELS[mkey]
        try:
            client = _client_for(cfg["provider"])
        except Exception as e:  # noqa: BLE001
            print(f"[{mkey}] 클라이언트 생성 실패: {e}", file=sys.stderr)
            continue
        print(f"\n=== {mkey} ({cfg['model']}) — {len(prepared)}장 ===")
        for item in prepared:
            rec = {"model": mkey, "file": item["file"], "expected": item["expected"],
                   "job_cd": item["job_cd"], "evidence_type": item["evidence_type"]}
            try:
                out = _coach_once(client, cfg["model"], item["system_prompt"], item["data_uri"], cfg["provider"])
                rec.update(out)
                rec["error"] = ""
                mark = "✓" if out["status"] == item["expected"] else "✗"
                print(f"  {mark} {item['file']:<28} 정답={item['expected']:<6} 예측={out['status']:<6} "
                      f"can_capture={out['can_capture']!s:<5} {out['latency_ms']}ms  \"{out['message']}\"")
            except Exception as e:  # noqa: BLE001
                rec.update({"status": "", "can_capture": "", "message": "",
                            "latency_ms": "", "prompt_tokens": 0, "completion_tokens": 0,
                            "error": str(e)[:160]})
                print(f"  ! {item['file']}: 오류 {rec['error']}", file=sys.stderr)
            results.append(rec)

    _summarize(results, model_keys)

    out_csv = manifest.with_name(manifest.stem + "_results.csv")
    with out_csv.open("w", encoding="utf-8-sig", newline="") as f:
        cols = ["model", "file", "job_cd", "evidence_type", "expected", "status",
                "can_capture", "message", "latency_ms", "prompt_tokens", "completion_tokens", "error"]
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in results:
            w.writerow({c: r.get(c, "") for c in cols})
    print(f"\n상세 결과 저장: {out_csv}")
    return 0


def _summarize(results: list[dict], model_keys: list[str]) -> None:
    by_model: dict[str, list[dict]] = defaultdict(list)
    for r in results:
        by_model[r["model"]].append(r)

    print("\n" + "=" * 96)
    print(f"{'모델':<22}{'N':>4}{'오류':>5}{'정확도':>8}{'false_OK':>10}{'false_REJ':>11}{'평균ms':>8}{'$/1k호출':>10}")
    print("-" * 96)
    for mkey in model_keys:
        recs = [r for r in by_model.get(mkey, []) if not r.get("error")]
        n = len(recs)
        errors = len([r for r in by_model.get(mkey, []) if r.get("error")])
        if n == 0:
            print(f"{mkey:<22}{0:>4}{errors:>5}{'-':>8}{'-':>10}{'-':>11}{'-':>8}{'-':>10}")
            continue
        exact = sum(1 for r in recs if r["status"] == r["expected"]) / n
        # false_OK: 찍으면 안 되는데(ok 아님) ok 라고 한 비율
        not_ok = [r for r in recs if r["expected"] != "ok"]
        false_ok = (sum(1 for r in not_ok if r["status"] == "ok") / len(not_ok)) if not_ok else 0.0
        # false_REJ: 찍어도 되는데(ok) ok 를 안 준 비율
        should_ok = [r for r in recs if r["expected"] == "ok"]
        false_rej = (sum(1 for r in should_ok if r["status"] != "ok") / len(should_ok)) if should_ok else 0.0
        avg_ms = sum(r["latency_ms"] for r in recs if isinstance(r["latency_ms"], int)) / n
        price = PRICES.get(MODELS.get(mkey, {}).get("model", mkey))
        if price:
            pin, pout = price
            ptok = sum(r["prompt_tokens"] for r in recs) / n
            ctok = sum(r["completion_tokens"] for r in recs) / n
            cost1k = (ptok * pin + ctok * pout) / 1_000_000 * 1000
            cost_s = f"${cost1k:.2f}"
        else:
            cost_s = "-"
        print(f"{mkey:<22}{n:>4}{errors:>5}{exact*100:>7.1f}%{false_ok*100:>9.1f}%"
              f"{false_rej*100:>10.1f}%{avg_ms:>7.0f}{cost_s:>10}")
    print("=" * 96)
    print("false_OK ↓ = 컴플라이언스 안전(부적합 사진 덜 통과) | false_REJ ↓ = 어르신 UX 안전(덜 답답) | $/1k = 폴링 1000회 실측 비용")


def main() -> int:
    ap = argparse.ArgumentParser(description="라이브 사진 코칭 모델 오판율 비교")
    sub = ap.add_subparsers(dest="cmd", required=True)

    pi = sub.add_parser("init", help="사진 폴더 → 라벨 템플릿 CSV 생성")
    pi.add_argument("--photos-dir", required=True)
    pi.add_argument("--out", default="manifest.csv")
    pi.set_defaults(func=cmd_init)

    pr = sub.add_parser("run", help="모델 비교 실행")
    pr.add_argument("--manifest", required=True)
    pr.add_argument("--photos-dir", default="")
    pr.add_argument("--models", default="", help="콤마구분. 기본: " + ",".join(DEFAULT_MODELS))
    pr.set_defaults(func=cmd_run)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
