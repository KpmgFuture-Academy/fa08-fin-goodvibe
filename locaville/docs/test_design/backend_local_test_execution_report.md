# Backend 로컬 테스트 실행 보고서

## 1. pytest 실행 명령

```bash
cd C:\Project\good-vibe\locaville\backend
python -m pytest tests -q
```

## 2. pytest 결과

* 결과: 성공
* 통과: 10
* 실패: 0
* 경고: 403
* 주요 경고 내용: Python 3.14 환경에서 FastAPI/Starlette 내부의 deprecated coroutine check 및 FastAPI `on_event` deprecation warning

## 3. Backend 서버 기동 여부

* 결과: 성공
* 기동 방식: 테스트용 임시 runner로 `app.main`의 FastAPI app을 로컬 기동
* 주소: `http://127.0.0.1:8000`
* 외부 API 호출 방지 조치: startup hook을 테스트 runner에서 비활성화
* 서비스 코드 수정 여부: 없음
* 서버 종료 여부: 확인 후 종료

참고: `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000` 형태의 순수 기동은 startup hook이 외부 API 캐시 예열을 시도할 수 있어, 이번 원칙에 맞게 테스트용 runner에서 startup hook만 비활성화했다.

## 4. `/health` 호출 결과

* 호출: `GET http://127.0.0.1:8000/health`
* HTTP status: 200
* Content-Type: `application/json`
* 응답 요약: backend status `ok`, service name 반환, storage mode 반환, DB check 결과 반환
* 민감정보 노출: 확인된 범위에서 없음

## 5. `/openapi.json` 호출 결과

* 호출: `GET http://127.0.0.1:8000/openapi.json`
* HTTP status: 200
* Content-Type: `application/json`
* OpenAPI title: `Jeotanmaeul Backend`
* OpenAPI version: `0.1.0`
* OpenAPI path 수: 80
* 민감정보 노출: 확인된 범위에서 없음

## 6. 실패 또는 미실행 사유

* pytest 전체 실행 실패 없음
* 로컬 서버 1차 기동 시도는 임시 runner가 `%TEMP%` 위치에서 실행되어 `app` import 경로를 찾지 못해 실패했다.
* 2차 시도에서 backend 경로와 `library` 경로를 명시해 기동 성공했다.
* APP/WEB 테스트는 이번 범위가 아니므로 실행하지 않았다.
* 외부 API, AI, 파일 업로드, PDF 생성, STT/TTS, 실제 DB 쓰기/삭제 테스트는 실행하지 않았다.

## 7. URL 없이 테스트 가능한 Backend 항목

* pytest 기반 router smoke 테스트
* FastAPI TestClient 기반 `/health`, `/todo/today`, `/diary`, `/evidence`, `/admin/summary`, `/admin/todo-status` 호출 가능성 확인
* service 함수 단위 테스트
* repository row mapping 테스트
* schema/validation 테스트
* fallback/mock 처리 테스트
* 파일 업로드 로직의 임시 파일/mock storage 기반 단위 테스트
* OpenAPI schema 생성 확인

## 8. URL 발급 후 다시 테스트할 Backend 항목

* 배포 URL 기준 `/health` 외부 접근 확인
* 배포 URL 기준 `/openapi.json` 접근 및 CORS 설정 확인
* APP/WEB 실제 origin에서 Backend API 호출 확인
* 외부 API 연동 기능의 staging/mock 환경 기준 검증
* 파일 업로드와 정적 파일 URL 접근 확인
* DB 연결이 필요한 조회 API의 실제 데이터 기준 응답 확인
* 인증/권한 정책이 확정된 뒤 관리자/농업인 role 기반 API 확인

