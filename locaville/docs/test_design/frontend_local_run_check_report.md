# Frontend 로컬 실행 가능 여부 점검 보고서

## 점검 범위

* APP: `locaville/app_user`
* WEB: `locaville/web_user`
* Backend 테스트: 이번 단계에서 재실행하지 않음
* 패키지 신규 설치: 없음
* 프론트 코드 수정: 없음

## 공통 환경

* Node.js: `v24.15.0`
* npm: `11.12.1`
* PowerShell에서 `npm.ps1`은 실행 정책으로 차단되어 `npm.cmd`를 사용해 확인함

## 1. APP package.json 확인 여부

* 경로: `locaville/app_user/package.json`
* 확인 결과: 있음
* `node_modules`: 있음

## 2. APP test script 여부

* `test` script: 없음
* 실행 여부: 미실행
* 미실행 사유: `package.json`에 test script가 정의되어 있지 않음

## 3. APP dev 실행 가능 여부

* `dev` script: 있음
* script 내용: `next dev`
* 실행 명령:

```bash
npm run dev -- -p 3100
```

* 실행 결과: 성공
* 확인 응답: `GET /` 200
* 종료 여부: 확인 후 종료

## 4. APP localhost 주소

* 확인 주소: `http://localhost:3100`
* 네트워크 주소도 Next.js 로그에 표시되었으나, 보고서에는 localhost 기준만 기록함

## 5. WEB package.json 확인 여부

* 경로: `locaville/web_user/package.json`
* 확인 결과: 있음
* `node_modules`: 있음

## 6. WEB test script 여부

* `test` script: 없음
* 실행 여부: 미실행
* 미실행 사유: `package.json`에 test script가 정의되어 있지 않음

## 7. WEB dev 실행 가능 여부

* `dev` script: 있음
* script 내용: `next dev`
* 실행 명령:

```bash
npm run dev -- -p 3101
```

* 실행 결과: 성공
* 확인 응답:
  * `GET /` 307
  * `GET /dashboard` 200
* 종료 여부: 확인 후 종료

## 8. WEB localhost 주소

* 확인 주소: `http://localhost:3101`
* 메인 `/` 경로는 `/dashboard`로 redirect되는 것으로 확인됨

## 9. 실패 또는 미실행 사유

* APP/WEB 모두 test script가 없어 테스트 실행은 하지 않음
* APP/WEB 모두 dev script는 정상 기동 확인
* 카메라, 음성, 다운로드, 클립보드 등 브라우저 권한 기능은 실제 기능 수행 없이 로컬 화면 실행 가능성만 확인
* 패키지 설치는 하지 않음
* `.env` 파일은 열거나 출력하지 않음

## 10. URL 발급 전 확인 가능한 항목

* 로컬 Next.js dev 서버 기동 여부
* 기본 라우트 또는 dashboard 라우트 응답 여부
* package script 구성 확인
* 로컬 화면 렌더링 시작 여부
* 정적 리소스 로딩 오류의 1차 확인
* test script 부재 여부 확인

## 11. URL 발급 후 다시 확인할 항목

* 배포 URL에서 APP/WEB 첫 화면 접근
* Backend 배포 URL 연결 후 API 호출 정상 여부
* CORS, 환경변수, 이미지/업로드 URL 접근 여부
* 카메라, 음성, 다운로드, 클립보드 등 브라우저 권한 기능
* 모바일 실제 기기에서 APP 화면/권한/반응형 확인
* 관리자 WEB에서 dashboard redirect와 메뉴 이동 확인

