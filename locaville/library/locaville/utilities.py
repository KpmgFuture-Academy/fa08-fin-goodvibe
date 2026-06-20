import os
import json
import hashlib
import random
import string
import time
from functools import lru_cache
from pathlib import Path
from dotenv import load_dotenv

HOME_NAME = "locaville"
BACKEND_NAME = "backend"


def randomize_filename(input_filename: str, method="hash") -> str:
    """파일명 본문을 바꾸고 확장자는 유지합니다.

    Args:
        input_filename: 확장자를 포함한 원본 파일명입니다.
        method: ``timestamp`` 또는 ``hash``.
            - ``timestamp``: ``초단위타임스탬프_랜덤4글자`` 형식
            - ``hash``: 파일명 본문의 SHA-256 해시
    """
    filename = Path(input_filename).name
    suffix = Path(filename).suffix
    stem = Path(filename).stem or filename

    if method == "timestamp":
        timestamp = str(int(time.time()))
        random_token = "".join(random.choices(string.ascii_lowercase + string.digits, k=4))
        return f"{timestamp}_{random_token}{suffix}"    
    else:
        hashed = hashlib.sha256(stem.encode("utf-8")).hexdigest()[:16]
        return f"{hashed}{suffix}"


def get_home(target_dir=HOME_NAME):
    """
    현재 작업 디렉토리부터 상위로 이동하며 target_dir 이름의 프로젝트 루트를 찾습니다.

    입력 파라미터:
        target_dir (str): 프로젝트의 기준이 되는 최상위 폴더 이름. 기본값은 "good-vibe".

    출력 값:
        Path: target_dir 에 해당하는 루트 경로
    """
    home_path = cur_path = Path(os.getcwd()).resolve()

    if target_dir not in cur_path.parts:
        raise FileNotFoundError(f"'{target_dir}' 폴더를 찾을 수 없습니다.")

    while home_path.name != target_dir:
        home_path = home_path.parent

    return home_path

@lru_cache(maxsize=1)
def load_backend_env() -> Path | None:
    """환경 변수를 .env 파일에서 한 번만 로드합니다.

    프로젝트 루트를 못 찾으면 (예: Render 등 운영 컨테이너) silent return None.
    환경 변수는 OS 레벨에서 주입된 것을 사용한다.
    """
    try:
        env_path = get_home(HOME_NAME) / BACKEND_NAME / ".env"
    except FileNotFoundError:
        return None
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=True)
        return env_path
    return None

# def get_envs(target_dir="good-vibe", env_file=".env"):
#     """
#     프로젝트 루트 폴더를 기준으로 환경 변수를 로드하고, JSON 형식의 값을 파이썬 객체로 자동 변환합니다.

#     기능:
#         1. 현재 작업 디렉토리부터 상위로 이동하며 'target_dir' 폴더를 찾아 프로젝트 루트로 설정합니다.
#         2. 루트 내 'config/.env' 파일을 찾아 시스템 환경 변수로 등록(load_dotenv)합니다.
#         3. .env 파일의 모든 값을 딕셔너리로 읽어오되, 리스트([])나 딕셔너리({}) 형태의 문자열은 
#            실제 파이썬 list/dict 객체로 자동 파싱하여 반환합니다.

#     입력 파라미터:
#         target_dir (str): 프로젝트의 기준이 되는 최상위 폴더 이름. 기본값은 "good-vibe".
#         env_file (str): 로드할 환경 변수 파일 이름. 기본값은 ".env".

#     출력 값:
#         dict: 로드된 모든 환경 변수를 담은 딕셔너리. 
#               (경로 정보 'HOME_PATH', 'ENV_FILE' 및 자동 변환된 객체들 포함)
#     """
#     home_path = get_home(target_dir=target_dir)

#     env_filepath = home_path / "config" / env_file
#     env_filepath = env_filepath.resolve()

#     if not env_filepath.exists():
#         raise FileNotFoundError(f"env 파일을 찾을 수 없습니다: {env_filepath}")

#     # 1. 시스템 환경 변수 로드 (os.environ에 등록)
#     load_dotenv(dotenv_path=env_filepath, override=True)

#     # 2. .env 파일의 내용을 딕셔너리로 읽기
#     # config = dotenv_values(env_path)
#     envs = dict(dotenv_values(env_filepath))
    
#     # 기본 경로 정보 및 필수 키 추가
#     envs.update({
#         "HOME_PATH": home_path,
#         "ENV_FILEPATH": env_filepath,
#     })

#     # 3. 값 순회 및 데이터 타입 자동 변환 (JSON 파싱)
#     for key, value in envs.items():
#         if isinstance(value, str):
#             clean_value = value.strip()
#             # 딕셔너리({ }) 또는 리스트([ ]) 형태 감지
#             if (clean_value.startswith("{") and clean_value.endswith("}")) or \
#                (clean_value.startswith("[") and clean_value.endswith("]")):
#                 try:
#                     # 문자열을 파이썬 객체(dict/list)로 변환
#                     envs[key] = json.loads(clean_value)
#                 except (json.JSONDecodeError, TypeError):
#                     # 유효한 JSON이 아닌 경우 문자열 유지
#                     pass

#     # 필수 값 검증
#     if not envs.get("OPENAI_API_KEY"):
#         envs["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY")
#         if not envs["OPENAI_API_KEY"]:
#             raise ValueError("OPENAI_API_KEY를 찾을 수 없습니다.")

#     return envs
