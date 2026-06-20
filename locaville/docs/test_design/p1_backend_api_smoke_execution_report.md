# P1 Backend API Smoke 실행 보고서

## pytest 설치 성공 여부

* pytest 설치: 성공
* FastAPI TestClient 사용 가능: 확인
* 참고: `requirements.txt` 전체 설치는 제한 시간 내 완료되지 않았으나, smoke 실행에 필요한 FastAPI/TestClient는 사용 가능했다.

## 생성한 테스트 파일

* `locaville/backend/tests/test_p1_backend_api_smoke.py`

## 실행한 명령

```bash
cd C:\Project\good-vibe\locaville\backend
python -m pytest tests/test_p1_backend_api_smoke.py -q
```

## 테스트 실행 결과

* 결과: 성공
* 통과: 6
* 실패: 0
* 경고: FastAPI/Starlette 및 Python 3.14 deprecation warning 발생
* 외부 API 호출 방지: startup hook 비활성화
* 실제 DB 쓰기/삭제 방지: GET API만 대상으로 하고 DB 의존 router 함수는 monkeypatch 처리
* 민감정보 노출 검증: 응답 본문에 traceback/secret/API key/DB password 계열 패턴이 없는지 확인

## 통과한 테스트 목록

| Method | Endpoint | 결과 | 비고 |
|---|---|---|---|
| GET | `/health` | 통과 | storage mode를 json으로 고정해 DB check 우회 |
| GET | `/admin/summary` | 통과 | admin summary service mock |
| GET | `/admin/todo-status` | 통과 | admin todo status service mock |
| GET | `/todo/today` | 통과 | today todo service mock |
| GET | `/diary` | 통과 | diary list service mock |
| GET | `/evidence` | 통과 | evidence list service mock |

## 실패한 테스트 목록

| Method | Endpoint | 실패 사유 |
|---|---|---|
| - | - | 없음 |

## 미실행 사유

* 이번 단계는 전체 P1 단위테스트가 아니라 smoke 수준 확인이 목적이므로, DB 저장/수정/삭제 API는 실행하지 않았다.
* 외부 API, AI, 파일 업로드, PDF 생성, STT/TTS, 카메라/브라우저 권한 관련 테스트는 실행하지 않았다.
* 실제 DB 연결 성공 여부는 이번 smoke 범위에서 확인하지 않았다.

## 다음 단계에서 확장 가능한 테스트 영역

* Backend API: request parameter validation, 404/422/503 응답 검증
* Backend Service: To-do 상태 계산, diary/evidence fallback, admin summary 가공 로직
* Backend Repository: 운영 DB가 아닌 테스트 DB 또는 mock session 기반 row mapping 검증
* Schema/Validation: diary/evidence/project/engage payload validation
* 파일 업로드: 임시 파일과 mock storage를 사용한 `POST /evidence/upload` 단위테스트
* 외부 API: 날씨/주소/AI API client mock 기반 fallback 테스트

