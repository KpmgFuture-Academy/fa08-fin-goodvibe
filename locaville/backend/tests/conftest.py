from __future__ import annotations

import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

LOCAVILLE_ROOT = BACKEND_ROOT.parent
LIBRARY_ROOT = LOCAVILLE_ROOT / "library"
if str(LIBRARY_ROOT) not in sys.path:
    sys.path.insert(0, str(LIBRARY_ROOT))

# backend 의 .env 를 pytest 환경에서도 자동 로드 — uvicorn 으로 띄울 때와 동일 동작.
# DATABASE_URL / OPENAI_API_KEY 등이 셸에 export 안 되어 있어도 테스트가 정상 실행.
_ENV_FILE = BACKEND_ROOT / ".env"
if _ENV_FILE.exists():
    try:
        from dotenv import load_dotenv  # python-dotenv 는 requirements 에 이미 포함

        load_dotenv(_ENV_FILE)
    except ImportError:
        pass
