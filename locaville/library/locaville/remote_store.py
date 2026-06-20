import os
from pathlib import Path
from supabase import create_client, Client

from locaville.utilities import load_backend_env

# .env 파일 활성화
load_backend_env()

# 환경 변수 로드
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
BUCKET_EVIDENCE = (
    os.getenv("BUCKET_EVIDENCE")
    or os.getenv("SUPABASE_BUCKET_EVIDENCE")
)


if not SUPABASE_URL or not SUPABASE_KEY or not BUCKET_EVIDENCE:
    raise ValueError("환경 변수 설정을 확인하세요.")

# Supabase 클라이언트 초기화
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def _build_upload_options(cache_control: str = "3600", upsert: bool = True) -> dict[str, str]:
    """storage3가 기대하는 문자열 헤더/옵션 형태로 업로드 옵션을 구성합니다."""
    options: dict[str, str] = {
        "cache-control": cache_control,
    }
    if upsert:
        options["x-upsert"] = "true"
    return options


def upload_evidence_file(source_filepath: str, remote_dir: str, remote_filename:str = ""):
    file_posix = Path(source_filepath)
    if not file_posix.exists():
        print(f"오류: {source_filepath} 파일이 존재하지 않습니다.")
        return None

    # 원격 파일명이 비어있으면, 원본 파일명을 가져옴
    if len(remote_filename) < 1 :
        remote_filename = file_posix.name
        
    remote_path = remote_dir + "/" + remote_filename
    
    
    with open(file_posix, "rb") as f:
        response = supabase.storage.from_(BUCKET_EVIDENCE).upload(
            remote_path,
            f,
            _build_upload_options(),
        )
    print(f"성공: 파일이 등록되었습니다. -> {remote_path}")
    return response


def download_evidence_file(source_path: str, local_dir: str, local_filename:str = ""):
    try:
        file_data = supabase.storage.from_(BUCKET_EVIDENCE).download(source_path)
        
        # 다운받을 파일명이 비어있으면, 원본 파일명을 가져옴
        if len(local_filename) < 1:
            local_filename = Path(source_path).name

        local_path = str(Path(local_dir) / local_filename)
        
        with open(local_path, "wb") as f:
            f.write(file_data)
        print(f"성공: 파일을 다운로드했습니다. -> {local_path}")
    except Exception as e:
        print(f"오류: 조회 및 다운로드 실패 -> {e}")


def get_locaville_public_url(source_path: str) -> str:
    url = supabase.storage.from_(BUCKET_EVIDENCE).get_public_url(source_path)
    print(f"공개 접근 URL: {url}")
    return url
