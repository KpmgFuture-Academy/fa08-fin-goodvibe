import os
from pathlib import Path
from supabase import Client, create_client
from locaville.utilities import load_backend_env


def _read_env_value(*keys: str) -> str | None:
    """첫 번째로 비어 있지 않은 환경 변수 값을 반환합니다."""
    for key in keys:
        value = os.getenv(key)
        if value is None:
            continue
        cleaned = value.strip().strip("\"'").strip()
        if cleaned:
            return cleaned
    return None


class LocavilleStorageClient:
    """Locaville용 Supabase Storage 클라이언트입니다.

    기능:
    - 환경 변수에서 Supabase 연결 정보를 읽어 클라이언트를 초기화합니다.
    - 기본 evidence bucket 또는 지정한 bucket으로 파일을 업로드/다운로드합니다.
    - 업로드된 파일의 공개 URL을 조회합니다.

    사용 예:
        client = LocavilleStorageClient()
        client.upload_evidence_file("sample.jpg", "evidence/2026")

        client.switch_bucket("other-bucket")
        url = client.get_locaville_public_url("evidence/2026/sample.jpg")
    """

    # 환경 변수를 읽어 Supabase Storage 클라이언트와 기본 bucket을 초기화합니다.
    def __init__(
        self,
        bucket_name: str | None = None,
    ) -> None:
        """Storage 클라이언트를 초기화합니다.

        Args:
            bucket_name: 사용할 bucket 이름입니다.
                None이면 환경 변수 `BUCKET_EVIDENCE` 또는
                `SUPABASE_BUCKET_EVIDENCE` 값을 사용합니다.
        """
        load_backend_env()

        supabase_url = _read_env_value(
            "SUPABASE_URL",
            "NEXT_PUBLIC_SUPABASE_URL",
        )
        supabase_key = _read_env_value(
            "SUPABASE_KEY",
            "SUPABASE_SERVICE_KEY",
            "SUPABASE_SERVICE_ROLE_KEY",
            "SUPABASE_ANON_KEY",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        )
        self.bucket_name = (
            bucket_name
            or _read_env_value("BUCKET_EVIDENCE")
            or _read_env_value("SUPABASE_BUCKET_EVIDENCE")
        )

        missing: list[str] = []
        if not supabase_url:
            missing.append("SUPABASE_URL")
        if not supabase_key:
            missing.append("SUPABASE_KEY")
        if not self.bucket_name:
            missing.append("bucket_name")
        if missing:
            raise ValueError(f"환경 변수 설정을 확인하세요. missing={', '.join(missing)}")

        self.supabase: Client = create_client(supabase_url, supabase_key)

    # 현재 인스턴스가 사용할 bucket을 다른 이름으로 전환합니다.
    def switch_bucket(self, bucket_name: str) -> None:
        """업로드/다운로드 대상 bucket을 변경합니다."""
        if not bucket_name:
            raise ValueError("bucket_name 값을 확인하세요.")
        self.bucket_name = bucket_name

    def get_current_bucket(self) -> str:
        """현재 사용 중인 bucket 이름을 반환합니다."""
        return self.bucket_name

    # Supabase upload API에 맞는 헤더 옵션을 구성합니다.
    def _build_upload_options(
        self,
        cache_control: str = "3600",
        upsert: bool = True,
    ) -> dict[str, str]:
        """Supabase Storage 업로드 옵션을 구성합니다."""
        options: dict[str, str] = {
            "cache-control": cache_control,
        }
        if upsert:
            options["x-upsert"] = "true"
        return options

    # 로컬 파일을 현재 bucket 경로로 업로드합니다.
    def upload_file(
        self,
        source_filepath: str,
        remote_dir: str,
        remote_filename: str = "",
    ):
        """로컬 파일을 현재 bucket의 지정 경로로 업로드합니다.

        Args:
            source_filepath: 업로드할 로컬 파일 경로입니다.
            remote_dir: bucket 내부 디렉터리 경로입니다.
            remote_filename: 원격 저장 파일명입니다.
                비어 있으면 로컬 파일명을 그대로 사용합니다.

        Returns:
            Supabase upload 응답 객체를 반환합니다.
            파일이 없으면 None을 반환합니다.
        """
        file_posix = Path(source_filepath)
        if not file_posix.exists():
            print(f"오류: {source_filepath} 파일이 존재하지 않습니다.")
            return None

        if len(remote_filename) < 1:
            remote_filename = file_posix.name

        remote_path = remote_dir + "/" + remote_filename

        with open(file_posix, "rb") as file_obj:
            response = self.supabase.storage.from_(self.bucket_name).upload(
                remote_path,
                file_obj,
                self._build_upload_options(),
            )
        print(f"성공: 파일이 등록되었습니다. -> {remote_path}")
        return response

    def upload_evidence_file(
        self,
        source_filepath: str,
        remote_dir: str,
        remote_filename: str = "",
    ):
        """호환성을 위해 유지되는 기존 업로드 함수입니다."""
        return self.upload_file(
            source_filepath=source_filepath,
            remote_dir=remote_dir,
            remote_filename=remote_filename,
        )

    # 현재 bucket의 파일을 로컬 디렉터리로 다운로드합니다.
    def download_file(
        self,
        source_path: str,
        local_dir: str,
        local_filename: str = "",
    ) -> None:
        """현재 bucket의 파일을 로컬 디렉터리로 다운로드합니다.

        Args:
            source_path: bucket 내부의 원격 파일 경로입니다.
            local_dir: 다운로드할 로컬 디렉터리입니다.
            local_filename: 저장할 로컬 파일명입니다.
                비어 있으면 원격 파일명을 그대로 사용합니다.
        """
        try:
            file_data = self.supabase.storage.from_(self.bucket_name).download(source_path)

            if len(local_filename) < 1:
                local_filename = Path(source_path).name

            local_path = Path(local_dir) / local_filename
            local_path.parent.mkdir(parents=True, exist_ok=True)

            with open(local_path, "wb") as file_obj:
                file_obj.write(file_data)
            print(f"성공: 파일을 다운로드했습니다. -> {local_path}")
        except Exception as exc:
            print(f"오류: 조회 및 다운로드 실패 -> {exc}")

    def download_evidence_file(
        self,
        source_path: str,
        local_dir: str,
        local_filename: str = "",
    ) -> None:
        """호환성을 위해 유지되는 기존 다운로드 함수입니다."""
        return self.download_file(
            source_path=source_path,
            local_dir=local_dir,
            local_filename=local_filename,
        )

    def delete_file(self, source_path: str):
        """현재 bucket의 파일을 삭제합니다."""
        cleaned_path = str(source_path or "").strip().lstrip("/")
        if not cleaned_path:
            return None
        return self.supabase.storage.from_(self.bucket_name).remove([cleaned_path])

    # 현재 bucket 파일의 공개 URL을 조회합니다.
    def get_locaville_public_url(self, source_path: str) -> str:
        """현재 bucket의 파일에 대한 공개 접근 URL을 반환합니다."""
        url = self.supabase.storage.from_(self.bucket_name).get_public_url(source_path)
        print(f"공개 접근 URL: {url}")
        return url
