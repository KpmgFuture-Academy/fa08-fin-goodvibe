# 시연 Runbook

> 시연 직전 / 직중 체크리스트. 폰 LAN + 데모 데이터 + 자주 만지는 명령.

---

## 1. 시연 전 30분 체크

### Backend
```powershell
cd C:\Users\Admin\good-vibe\locaville\backend
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

검증:
```
GET http://localhost:8000/health         → {ok: true, db: ok}
GET http://localhost:8000/todo/today?farmer_id=kimys68
```

### Frontend (3개 프로젝트 각자)
```powershell
# 농업인 앱
cd C:\Users\Admin\good-vibe\locaville\app_user
pnpm dev -H 0.0.0.0 -p 3000

# 이장님
cd C:\Users\Admin\good-vibe\locaville\web_user
pnpm dev -H 0.0.0.0 -p 3001

# 관리자
cd C:\Users\Admin\good-vibe\locaville\web_admin
pnpm dev -H 0.0.0.0 -p 3002
```

### 폰 LAN 접속

1. PC 의 LAN IP 확인:
   ```powershell
   ipconfig | findstr IPv4
   ```
2. `.env.local` 의 `NEXT_PUBLIC_API_BASE_URL=http://<IP>:8000` 갱신.
3. `next.config.mjs` 의 `allowedDevOrigins` 에 IP 추가.
4. dev server **재시작** (config 변경은 hot reload X).
5. 폰 Chrome / Safari 에서:
   - 농업인 앱: `http://<IP>:3000`
   - 이장님: `http://<IP>:3001`

---

## 2. 데모 데이터

```powershell
# 초기화 + 시드
curl -X POST http://localhost:8000/demo/reset
curl -X POST http://localhost:8000/demo/seed

# 김영수의 todo 마감 정규화 (선택)
.\.venv\Scripts\python scripts\normalize_kimys_todos.py
```

### 시연용 GPS 등록 (폰 위치를 농가 parcel 로)
```
폰 Chrome → http://<IP>:3000/dev/seed-here
→ "현재 위치를 농가 위치로 등록" 버튼 → GPS 권한 허용
```

---

## 3. 시연 시나리오 흐름

[`final-demo-scenario.md`](./final-demo-scenario.md) 참고. 핵심:

1. **김영수 농업인 앱 진입** (카카오톡 로그인 → 자동 진입)
2. **✦ 오늘 한마디** + **오늘 할 일** 카드 확인 ("농자재 구입 — 6월 30일까지")
3. **사진 찍고 완료하기** → PhotoLiveCoachOverlay
   - HTTPS 환경 (Vercel) 이면 카메라 켜짐 + TTS 음성 안내
   - LAN HTTP 면 file input fallback
4. **셔터 → CompletionModal** ("사진을 등록했어요" + AI 가 본 사진)
5. **이장님 대시보드** (`web_user/dashboard`)
   - "오늘 먼저 챙길 일" 에 박정호 농가 등 → [문자로 알려주기]
   - 사진 검토 → confirmed
6. **농사 도와주기**: 김영수 홈에서 "박정호님 농가로 이동" → 트랙터 트랜지션 2.5초 → 박정호의 todo 보임 → 다시 "도움 마치기" → 김영수 농가로 복귀

---

## 4. 자주 만나는 시연 직전 이슈

| 증상 | 빠른 fix |
|---|---|
| 폰에서 농업인 앱 안 뜸 | `.env.local` IP 갱신 + dev 재시작 |
| 카메라 안 켜짐 (라이브 코칭) | LAN HTTP 라서. 정식 시연은 Vercel HTTPS 사용 |
| 알림 panel 안 뜸 | `/demo/seed` 다시 호출 — `notification` 비어있을 수 있음 |
| todo 안 뜸 | `prj_todo_list` 비어있음. seed 또는 `POST /engage/projects/.../todos/create` |
| 참여사업/단체 빈 칸 | `/ville-project?farmer_id=` 가 정상 응답하는지 확인 |
| TTS "들어보기" 안 들림 | OpenAI key 없으면 brower speechSynthesis fallback. 또는 폰 음량 확인 |

---

## 5. 시연 폰 권장 설정

- iPhone 14+ 또는 Galaxy S22+ 권장 (작은 폰은 농업인 앱의 큰 카드 가로 잘림)
- Chrome 또는 Safari **최신 버전**
- 위치 + 카메라 + 마이크 **권한 미리 허용** (도메인별 1회 허용)
- 알림 권한은 옵션 (현재 미사용)

---

## 6. Vercel + Render 배포 시연

배포 환경에서 시연 시:

```
농업인 앱:   https://locaville-app.vercel.app
이장님:     https://locaville-web.vercel.app
관리자:     https://locaville-admin.vercel.app
Backend:    https://locaville-api.onrender.com
```

장점:
- HTTPS → 카메라 / 라이브 코칭 정상
- 인터넷 어디서나 접속

주의:
- Render Free 의 cold start ~30초 → 시연 직전 `GET /health` 1번 호출로 깨우기
- `NEXT_PUBLIC_API_BASE_URL` 가 Render URL 가리키게 빌드되어 있어야

---

## 7. 시연 종료 후

```powershell
# (필요 시) 시연 데이터 초기화
curl -X POST http://localhost:8000/demo/reset

# .env.local 의 LAN IP → localhost 복귀 (선택)
```

---

## 8. 디버깅 정보 수집

문제 발생 시:
- Backend stdout (uvicorn 로그)
- Frontend `pnpm dev` stdout
- Brower DevTools Console + Network
- 폰 시연은 브라우저 dev tools 없음 — 백엔드 로그 위주

특히 `POST /evidence/upload` 또는 `POST /diary` 의 detail 메시지에 SQL cause 가 prepend 되어 있음 (`diary_rdb.py` 의 패턴). 그게 가장 빠른 진단.
