# 저탄마을 시각화 자료 모음

이 문서는 스프린트 4 까지 만든 시스템 구조와 사용자 흐름을 한눈에 볼 수 있도록 정리한 다이어그램 모음이다. 모든 그림은 Mermaid 로 그려서, GitHub 뷰어와 VS Code Markdown 미리보기에서 그대로 렌더링된다.

---

## 1. 어떤 다이어그램을 그릴지 고민한 흔적

처음에 고려한 후보는 열두 개였다.

| # | 후보 | 채택 여부 | 이유 |
|---|---|---|---|
| 1 | 시스템 아키텍처 (4 덩어리 + 외부 API) | ✅ | 평가자가 가장 먼저 보는 그림 |
| 2 | 배포 토폴로지 (GitHub → Render/Vercel/Supabase) | ✅ | 배포 보고서를 보완 |
| 3 | 3-앱 데이터 일관성 시퀀스 (농민 → 이장 → 알림) | ✅ | 시연 핵심 시나리오 |
| 4 | 시행령 자동 등록 흐름 (REQ_WEB_036/037) | ✅ | 스프린트 4 의 가장 큰 신규 |
| 5 | evidence 라이프사이클 상태도 | ✅ | 컴플라이언스 본질 |
| 6 | AI 모듈 fallback 체인 (5종) | ✅ | OpenAI 의존 graceful 검증 |
| 7 | DB 핵심 ERD (사업 → 활동 → Job → todo → 일지 → 증빙) | ✅ | 도메인 데이터 모델 |
| 8 | 테스트 시나리오 8 영역 마인드맵 | ✅ | 요구사항 ↔ 테스트 매핑 시각화 |
| 9 | 도우미 모드 페어 흐름 | 보류 | 시퀀스 3 과 비슷, 분량 |
| 10 | RAG 검색 단독 흐름 | 보류 | 시행령 흐름 4 안에 포함 |
| 11 | 음성 영농일지 세션 흐름 | 보류 | "자동 저장 금지" 는 상태도 5 로 충분 |
| 12 | 사용자 페르소나 × 화면 매트릭스 | 보류 | 시각화보다 표가 더 명확 |

최종 8개를 골랐다. 보류한 4개는 같은 의도를 다른 그림이 이미 다루거나, 표 형태가 더 명확하기 때문이다.

---

## 2. 시스템 아키텍처 — 무엇이 어디에 있고 무엇을 한다

저탄마을의 네 덩어리와 그 사이의 데이터 흐름이다. 평가자가 첫 페이지로 보면 좋다.

```mermaid
graph TB
    %% 사용자
    농민["👨‍🌾 농민<br/>60~80대"]
    이장["👨‍💼 이장"]
    관리자["👩‍💻 관리자"]

    %% Frontend
    subgraph FE["프론트엔드 (Next.js 16)"]
        appUser["app_user<br/>농민 폰 앱"]
        webUser["web_user<br/>이장 대시보드"]
        webAdmin["web_admin<br/>관리자 화면"]
    end

    %% Backend
    subgraph BE["백엔드 (FastAPI)"]
        api["REST API<br/>routers/*"]
        ai["AI 서비스<br/>Vision · STT · TTS · RAG · advice"]
        photoGuard["사진 처리<br/>워터마크 · EXIF · 블러 검사"]
        reportGen["PDF 리포트 생성<br/>(ReportLab)"]
    end

    %% Data
    subgraph DATA["데이터 (Supabase)"]
        pg["PostgreSQL<br/>(영농일지·증빙·todo·사업)"]
        pgvec["pgvector<br/>(RAG 청크 218건)"]
        storage["Object Storage<br/>(사진·영수증)"]
    end

    %% External
    subgraph EXT["외부 API"]
        openai["OpenAI<br/>Vision · Whisper · GPT"]
        kakao["카카오<br/>주소 검색"]
        weather["기상청<br/>단기예보"]
        nongsaro["농촌진흥청<br/>주간 농사정보"]
    end

    농민 --> appUser
    이장 --> webUser
    관리자 --> webAdmin

    appUser --> api
    webUser --> api
    webAdmin --> api

    api --> pg
    api --> storage
    ai --> pgvec
    ai --> openai
    api --> kakao
    api --> weather
    api --> nongsaro
    photoGuard --> storage
    reportGen --> pg
    reportGen --> storage

    classDef user fill:#fff7ed,stroke:#b5601b,stroke-width:2px
    classDef fe fill:#e3f0e6,stroke:#2f6d4f,stroke-width:2px
    classDef be fill:#2f6d4f,stroke:#1c4a36,color:#fff
    classDef data fill:#f8f5ee,stroke:#d2c9b1,stroke-width:2px
    classDef ext fill:#fbfaf6,stroke:#5e6356

    class 농민,이장,관리자 user
    class appUser,webUser,webAdmin fe
    class api,ai,photoGuard,reportGen be
    class pg,pgvec,storage data
    class openai,kakao,weather,nongsaro ext
```

---

## 3. 배포 토폴로지 — GitHub 에서 운영까지

main 브랜치에 push 가 들어왔을 때 backend 와 frontend 가 어떻게 동시에 다시 띄워지는지의 그림이다. 배포 보고서 §3 을 시각으로 보완한다.

```mermaid
graph LR
    개발자["👩‍💻 개발자"] -->|"git push origin main"| github["GitHub<br/>cherrima/good-vibe"]

    github -->|"webhook"| render["Render<br/>(backend)<br/>starter plan · Singapore"]
    github -->|"Action + Vercel 통합"| vercel["Vercel<br/>(frontend × 3)<br/>hobby plan"]

    render -->|"DB_URL"| supaDB[("Supabase<br/>PostgreSQL + pgvector")]
    render -->|"SUPABASE_KEY"| supaStorage[("Supabase<br/>Object Storage")]
    render -->|"OPENAI_API_KEY"| openaiAPI["OpenAI API"]

    vercel -->|"NEXT_PUBLIC_API_BASE_URL"| render

    user1["📱 농민"] -->|"HTTPS"| vercel
    user2["💻 이장"] -->|"HTTPS"| vercel
    user3["💻 관리자"] -->|"HTTPS"| vercel

    classDef src fill:#fff7ed,stroke:#b5601b
    classDef host fill:#2f6d4f,stroke:#1c4a36,color:#fff
    classDef data fill:#f8f5ee,stroke:#d2c9b1
    classDef user fill:#e3f0e6,stroke:#2f6d4f

    class 개발자 src
    class github src
    class render,vercel host
    class supaDB,supaStorage,openaiAPI data
    class user1,user2,user3 user
```

---

## 4. 농민 → 이장 → 알림 — 시연의 핵심 시나리오

농민이 사진 한 장을 올리면 이장 화면에 즉시 보이고, 이장이 검토 결과를 보내면 농민에게 알림이 자동으로 간다. 저탄마을의 가치가 가장 압축된 흐름이다. L3 e2e 테스트가 이 시퀀스를 자동으로 검증한다.

```mermaid
sequenceDiagram
    autonumber
    actor 농민
    participant 농민앱 as app_user
    participant API as backend
    participant DB as Supabase
    participant 이장앱 as web_user
    actor 이장

    농민->>농민앱: 오늘 할 일 → 사진 첨부
    농민앱->>API: POST /evidence/upload<br/>(multipart + EXIF + GPS)
    API->>API: 워터마크 합성<br/>(농가명·촬영시각·GPS)
    API->>DB: INSERT evidence<br/>status=needs_review
    API-->>농민앱: 201 + evidence_id
    농민앱-->>농민: "사진을 등록했어요"

    Note over 농민,DB: 이장 화면이 폴링 또는 새로고침으로 받음

    이장앱->>API: GET /admin/summary
    API->>DB: SELECT recent_evidence
    DB-->>API: 새 evidence 포함
    API-->>이장앱: recent_evidence 목록
    이장-->>이장앱: 사진 검토

    alt 정상
        이장앱->>API: PATCH /evidence/{id}<br/>{status: confirmed}
        API->>DB: UPDATE evidence
    else 다시 찍어야 함
        이장앱->>API: PATCH /evidence/{id}<br/>{status: retake_required, msg}
        API->>DB: UPDATE evidence
        API->>DB: INSERT notification<br/>(content_cd=RETAKE, sender_cd=C)
    end

    Note over 농민,API: 농민 앱이 60초마다 폴링

    농민앱->>API: GET /farmer/{id}/notifications/unread-count
    API->>DB: SELECT notification
    API-->>농민앱: 새 알림 1건
    농민앱-->>농민: "이장님이 사진을 다시 찍어 달라고 했어요"
```

---

## 5. 시행령 자동 등록 — 스프린트 4 의 가장 큰 신규 기능

관리자가 정부 시행령 (.pdf / .docx / .hwpx) 한 장을 업로드하면, backend 가 청크화·임베딩·LLM 추출까지 한 endpoint 로 끝낸다. REQ_WEB_036·037 의 흐름이다.

```mermaid
graph TB
    Start(["관리자가 시행령 파일 업로드<br/>(.pdf / .docx / .hwpx, ≤ 30MB)"]) --> Validate{확장자<br/>검증}
    Validate -->|미지원| Fail400["400 거절"]
    Validate -->|OK| Extract

    subgraph Ingest["document_ingest_service"]
        Extract["텍스트 추출<br/>(pypdf · python-docx · hwpx_ingest)"]
        Chunk["청크 분할<br/>_chunk_parsed_blocks"]
        Embed["OpenAI 임베딩<br/>text-embedding-3-large<br/>(1536 dim)"]
        Insert["pgvector INSERT<br/>ON CONFLICT DO UPDATE"]
        Extract --> Chunk --> Embed --> Insert
    end

    subgraph Draft["admin_project_draft_service"]
        MetaLLM["LLM #1: 사업 메타 추출<br/>(사업명·연도·주관·대상작물·예산·문의)"]
        TodoLLM["LLM #2: todo 작업명 추출<br/>(농가 수행 작업 목록)"]
        RuleRAG["각 작업명별<br/>extract_policy_schedule_rule<br/>(RAG: 막 적재한 청크 검색)"]
        MetaLLM --> TodoLLM --> RuleRAG
    end

    Insert -->|chunks| MetaLLM
    RuleRAG --> Response

    Response["응답 JSON<br/>{ingest, project_draft, todo_drafts, preview_blocks}"]
    Response --> Form["관리자 화면 form prefill<br/>(검토 후 사용자가 사업 등록)"]
    Form --> PostProject["POST /project<br/>(program_master + project 한 트랜잭션)"]

    classDef start fill:#fff7ed,stroke:#b5601b,stroke-width:2px
    classDef ingest fill:#e3f0e6,stroke:#2f6d4f
    classDef draft fill:#f8f5ee,stroke:#d2c9b1
    classDef final fill:#2f6d4f,stroke:#1c4a36,color:#fff

    class Start start
    class Extract,Chunk,Embed,Insert ingest
    class MetaLLM,TodoLLM,RuleRAG draft
    class Form,PostProject final
```

---

## 6. evidence 라이프사이클 — 컴플라이언스의 본질

농민이 올린 사진 한 장이 처음 등록될 때부터 정부 제출용 PDF 에 들어갈 때까지의 상태 변화. 자동 확정이 없는 점, 재촬영 흐름, soft delete 가 한 그림에 들어 있다.

```mermaid
stateDiagram-v2
    [*] --> needs_review: POST /evidence/upload<br/>(농민 사진 등록)

    needs_review --> confirmed: PATCH<br/>(이장 승인)
    needs_review --> retake_required: PATCH<br/>(이장 재촬영 요청)
    needs_review --> deleted: DELETE /admin/evidence/{id}<br/>(soft delete)

    retake_required --> needs_review: 농민이 사진 다시 등록<br/>(자동 알림 발송 후)
    retake_required --> deleted: soft delete

    confirmed --> deleted: 잘못 승인된 경우<br/>(이장 soft delete)
    confirmed --> [*]: 정부 제출 PDF 에 포함

    state needs_review {
        [*] --> 자동확정X
        자동확정X: Vision 후보만 제시 (needs_confirmation=True)
        자동확정X: 영수증 OCR 도 confidence 낮으면 자동 매핑 X
    }

    state retake_required {
        [*] --> 알림자동
        알림자동: notification 자동 INSERT<br/>content_cd=RETAKE, sender_cd=C
    }

    note right of confirmed
        capture_dt ≤ reg_dt 강제
        (미래 시각 사진 위조 차단)
    end note

    note right of deleted
        soft delete = deleted_dt 세팅
        실 파일은 cleanup job 별도
    end note
```

---

## 7. AI 모듈 fallback 체인 — OpenAI 가 꺼져도

저탄마을의 5개 AI 모듈은 모두 OpenAI 에 의존하지만, 키가 만료되거나 API 가 응답하지 않을 때를 위한 안전한 fallback 경로를 갖고 있다. L5 검증 영역이 이 그림이다.

```mermaid
graph TB
    User(["사용자 입력"]) --> Module{어떤 AI<br/>모듈?}

    Module -->|사진| Vision
    Module -->|음성→텍스트| STT
    Module -->|텍스트→음성| TTS
    Module -->|정책 Q&A| Chat
    Module -->|오늘 한마디| Advice

    subgraph Vision_Branch["Vision (사진 분류)"]
        Vision["OPENAI_API_KEY 있나?"] -->|있음| V1["OpenAI Vision 호출"]
        Vision -->|없음| Vfallback["classification='unknown'<br/>source='fallback'"]
        V1 -->|성공| V2["receipt vs field_photo<br/>+ 영수증 OCR"]
        V1 -->|실패| Vfallback
    end

    subgraph STT_Branch["STT (음성 인식)"]
        STT["KEY 있나?"] -->|있음| S1["Whisper 호출<br/>+ 도메인 prompt"]
        STT -->|없음| Sfallback["text=''<br/>source='fallback'<br/>→ frontend가 Web Speech 폴백"]
        S1 -->|실패| Sfallback
    end

    subgraph TTS_Branch["TTS (음성 합성)"]
        TTS["빈 텍스트?"] -->|예| T400["400 raise<br/>(silent fallback X)"]
        TTS -->|아니오| Tcheck["KEY 있나?"]
        Tcheck -->|없음| Tfallback["b'' + 'fallback'<br/>→ frontend speechSynthesis 폴백"]
        Tcheck -->|있음| T1["gpt-4o-mini-tts 호출"]
        T1 -->|실패| Tfallback
    end

    subgraph Chat_Branch["Chat RAG (정책 Q&A)"]
        Chat["pgvector 검색"] -->|0 hit| Cfallback["source_type='fallback'<br/>+ '확인이 필요해요' 톤"]
        Chat -->|hit 있음| C1["LLM 호출"]
        C1 -->|실패| Cfallback
        C1 -->|성공| C2["답변 + 출처"]
    end

    subgraph Advice_Branch["advice (오늘 한마디)"]
        Advice["LLM 호출"] -->|성공| A1["('LLM 텍스트', 'RULELLM')"]
        Advice -->|key 없음 / 실패| Afallback["(fallback_template, 'RULE')<br/>룰 기반 한 줄 그대로"]
    end

    classDef branch fill:#e3f0e6,stroke:#2f6d4f
    classDef ok fill:#2f6d4f,color:#fff,stroke:#1c4a36
    classDef fallback fill:#fff0d8,stroke:#b5601b

    class Vision,STT,TTS,Chat,Advice branch
    class V2,T1,C2,A1 ok
    class Vfallback,Sfallback,Tfallback,Cfallback,Afallback,T400 fallback
```

---

## 8. 도메인 데이터 모델 (핵심 ERD)

저탄마을의 도메인이 어떻게 데이터로 표현되어 있는지의 그림. 매핑 표 §1 의 요구사항이 실제로 어느 테이블을 건드리는지 추적할 때 같이 본다.

```mermaid
erDiagram
    program_master ||--o{ project : "biz_id"
    project ||--o{ prj_activity : "prj_id"
    prj_activity ||--o{ prj_job : "activity_id"
    project ||--o{ prj_todo_list : "prj_id"
    prj_activity ||--o{ prj_todo_list : "activity_id"
    farm_job ||--o{ prj_job : "job_cd"
    farm_job ||--o{ prj_todo_list : "job_cd"

    ville_group ||--o{ prj_grp : "group_no"
    project ||--o{ prj_grp : "prj_id"
    ville_group ||--o{ prj_todo_list : "group_no"

    user_master ||--o{ amo_family : "user_no"
    amo_family ||--o{ parcel : "amo_regno"
    amo_family ||--o{ journal : "amo_regno"
    amo_family ||--o{ evidence : "amo_regno"

    journal ||--o{ evidence : "user_no+job_date+exec_no"

    user_master ||--o{ notification : "user_no"
    user_master ||--o{ farm_helper : "helper_user_no"
    user_master ||--o{ farm_helper : "recipient_user_no"

    user_master ||--o{ advice_rdb : "user_no"

    program_master {
        string biz_id PK
        string biz_name
        text biz_overview
    }
    project {
        string prj_id PK
        string biz_id FK
        string prj_name
        int exec_year
        date post_date
        string issuer
    }
    prj_activity {
        string prj_id PK
        string activity_id PK
        string activity_name
        date est_start_date
        date est_end_date
        int subsidy_amt
    }
    prj_job {
        string prj_id PK
        string activity_id PK
        int job_seq PK
        string job_cd FK
        string mandatory_yn
        string evidence_yn
    }
    journal {
        int user_no PK
        date job_date PK
        int exec_no PK
        string job_cd FK
        text exec_desc
        text ai_result_json
    }
    evidence {
        int user_no PK
        int seq_no PK
        date job_date PK
        int exec_no PK
        string evid_cd
        string ai_label
        float gps_lat
        float gps_long
        timestamp capture_dt
        timestamp reg_dt
        text raw_json
    }
    notification {
        bigint notice_no PK
        int user_no FK
        string sender_cd
        string content_cd
        string title
        timestamp sent_dt
    }
    farm_helper {
        int helper_user_no PK
        int help_seq PK
        int recipient_user_no
        date assigned_dt
        date real_end_date
    }
```

---

## 9. 테스트 시나리오 8 영역 — 요구사항이 어디로 흩어지나

요구사항 67건이 자동 테스트의 8 영역으로 어떻게 흩어져 들어가는지의 그림이다. 매핑 표를 시각으로 보완한다.

```mermaid
mindmap
  root((테스트<br/>시나리오<br/>8 영역))
    농민 앱 핵심 경로
      REQ_APP_003 오늘 할 일
      REQ_APP_005 일지 작성
      REQ_APP_006 사진 등록
      REQ_APP_013 일지 상세
      REQ_APP_019 PDF 다운로드
      REQ_APP_021 사진 업로드
    이장 대시보드
      REQ_WEB_001 마을 현황
      REQ_WEB_005 재촬영 요청
      REQ_WEB_020 증빙 상태 변경
      REQ_WEB_022 도움 관계 조회
      REQ_WEB_023 도우미 지정
      REQ_WEB_024 도우미 해제
    관리자 사업 생애주기
      REQ_WEB_031 프로젝트 목록
      REQ_WEB_032 사업 등록
      REQ_WEB_034 활동 등록
      REQ_WEB_036 시행령 청킹
      REQ_WEB_037 todo 초안
    데이터·보안 원칙
      todo source RDB
      AI 자동확정 X
      farmer_id 단일성
      Secrets backend only
      자동 저장 금지
    정부 인증 컴플라이언스
      EXIF 추출
      워터마크 규칙
      시간 위조 차단
      GPS-농지 거리
      재촬영 알림
      PDF 형식
    AI 모듈 안전망
      Vision fallback
      STT fallback
      TTS fallback
      Chat RAG fallback
      advice fallback
    시니어 가독성
      baseline 폰트
      큰 글자 모드
      버튼 사이즈
      색 토큰
      WCAG 대비
    응답 속도 보류
      endpoint latency
      payload 크기
      pgvector 검색
      PDF 생성
```

---

## 10. 다이어그램 활용 가이드

각 다이어그램이 어디서 가장 도움 되는지의 매핑.

| 다이어그램 | 누가 / 언제 |
|---|---|
| 시스템 아키텍처 | 평가·심사 첫 페이지 / 신규 인수 진입 / 외부 발표 |
| 배포 토폴로지 | DevOps 인수 / 비용 검토 / 운영 권한 이전 시 |
| 농민 → 이장 → 알림 시퀀스 | 시연 시나리오 설명 / e2e 테스트 작성 시 |
| 시행령 자동 등록 흐름 | 관리자 화면 PM 인계 / RAG 동작 설명 |
| evidence 라이프사이클 | 컴플라이언스 설명 / 정부 감사 대응 / status 코드 추가 시 |
| AI 모듈 fallback | 운영 사고 대응 매뉴얼 / 신규 AI 모듈 추가 시 |
| 도메인 ERD | 신규 backend 개발자 인계 / 새 쿼리 작성 / DB 마이그 계획 |
| 8 영역 마인드맵 | 평가·심사 단일 슬라이드 / 새 요구사항이 어느 영역에 들어갈지 분류 |

---

## 11. 추가 검토

위 8 개로 충분하지 않은 경우 다음을 더 그릴 수 있다.

- **도우미 모드 상태 전이** — 페어 배정 → 양쪽 동의 대기 → 활성 → 해제 까지의 state diagram
- **음성 영농일지 세션** — start → reply (최대 3턴) → finalize → POST /diary 까지의 시퀀스, "자동 저장 금지" invariant 시각화
- **사용자 권한 매트릭스** — 농민·이장·관리자·도우미 각각이 접근 가능한 API 와 화면의 표
- **RAG 검색 흐름 (단독)** — 사용자 질문 → embedding → pgvector + boost + MMR → LLM → 응답
- **PDF 리포트 생성 흐름** — todo + 일지 + 증빙 모음 → ReportLab → 한글 폰트 → 페이지 footer
- **시드 데이터 ER** — 데모 농가 7명 × 사업 × 활동 × 일지 × 증빙의 cross product (시연 데이터 사전 점검용)
