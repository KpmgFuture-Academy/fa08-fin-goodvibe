# 테이블 변경 절차 가이드

## 1. 목적

이 문서는 기존 테이블의 컬럼 추가, 컬럼명 변경, 속성 변경 시 따라야 할 표준 절차와 작성 산출물을 정의한다.

다음 목적을 함께 가진다.

- DBA 협의 시 변경 범위와 적용 절차를 명확히 정리한다.
- 실제 DDL/이관 SQL 작성 시 누락을 줄인다.
- AI agent, 개발자, 리뷰어가 같은 기준으로 작업할 수 있도록 prompt context 역할을 한다.

문서 및 SQL 산출물의 기본 저장 위치는 다음과 같다.

- `D:\Workspace\Python\good-vibe\locaville\docs\ddl-sql`
- repo 상대 경로: `locaville/docs/ddl-sql`

---

## 2. 기본 원칙

- 운영 DB의 스키마 변경은 반드시 사전 검토 후 진행한다.
- 기존 데이터 보존 여부를 먼저 판단하고, 데이터 유무에 따라 절차를 나눈다.
- 최종적으로는 "현재 기준의 최신 CREATE TABLE DDL" 과 "실제 적용 SQL" 을 분리해 관리한다.
- 단순 수정처럼 보여도, `NOT NULL`, `DEFAULT`, 컬럼 타입 변경, 컬럼명 변경은 데이터 영향 여부를 먼저 확인한다.
- 데이터가 있는 테이블은 복구 가능하도록 백업 절차를 포함한다.
- 기존 인덱스는 원칙적으로 유지한다.
- 인덱스 개선안이 있더라도 즉시 변경하지 않고, 영향 범위를 사전 질의/협의한 후 반영한다.
- ERD Cloud 상의 테이블 구조는 audit 컬럼이 생략된 표현일 수 있으므로, 실제 DB 작업 시 기존 audit 컬럼은 유지한다.
- 표준 SQL 과 실제 운영 PostgreSQL 구현 간 차이는 최소 범위에서만 반영한다.
- 예를 들어 표준 설계가 `JSON` 이더라도 PostgreSQL 에서는 `JSONB` 가 더 적합할 수 있으며, 이 경우 사전 확인 후 수정 반영한다.
- 테이블명과 컬럼명은 소문자를 기본 원칙으로 한다.
- 신규 또는 변경 컬럼명은 예약어 충돌 여부를 사전 확인하고, 충돌 시 다른 이름을 제안한다.
- SQL 은 가능한 한 표준 SQL 기준으로 작성한다.
- DBMS 종속 문법은 꼭 필요한 경우에만 사용하고, 사용 사유를 주석 또는 문서에 남긴다.

표준 SQL 준수 원칙:

- 기본 DDL/DML 은 ANSI/표준 SQL 형태를 우선 사용한다.
- 테이블/컬럼 정의는 의미가 분명한 일반 SQL 문법으로 작성한다.
- 테이블명과 컬럼명은 소문자 snake_case 를 우선 사용한다.
- 특정 DBMS 전용 함수, 힌트, 확장 문법은 최소화한다.
- PostgreSQL 전용 문법이 필요한 경우에는 "왜 필요한지" 를 함께 기록한다.
- 표준과 실제 PostgreSQL 구현 차이가 있으면 최소한으로만 조정한다.
- `JSON -> JSONB` 와 같은 타입 조정은 사전 확인 후 반영한다.
- 신규/변경 컬럼명은 표준 SQL 및 PostgreSQL 예약어 충돌 여부를 먼저 확인한다.
- 애플리케이션 코드에서는 별도 가이드인 [DBMS_중립코드_작성_수정_가이드.md](./locaville/docs/database/DBMS_중립코드_작성_수정_가이드.md)를 따른다.

---

## 3. DB 변경 절차

### 3.1 기존 테이블 확인

변경 작업 시작 전 반드시 아래를 확인한다.

- 현재 테이블 DDL
- 현재 컬럼 목록, 타입, 길이, NULL 허용 여부, DEFAULT, PK/FK/INDEX
- 현재 데이터 존재 여부
- 연관된 view, procedure, batch, API, frontend/backend 사용 코드
- 기존 인덱스 목록과 사용 목적
- 기존 audit 컬럼(`reg_dt`, `reg_no`, `mod_dt`, `mod_no` 등) 유지 여부
- 표준 설계와 실제 PostgreSQL 구현 차이 존재 여부
- 신규/변경 테이블명 및 컬럼명이 소문자 규칙을 따르는지
- 신규/변경 컬럼명이 예약어와 충돌하는지

확인 항목 예시:

- 대상 테이블에 데이터가 1건 이상 존재하는지
- 변경하려는 컬럼이 다른 SQL, 서비스 코드, 리포트, 배치에서 사용 중인지
- 신규 컬럼이 `NOT NULL` 인 경우 기존 레코드에 어떤 값을 넣을지
- 기존 인덱스를 유지해야 하는지, 또는 개선 필요성이 실제로 있는지
- ERD Cloud 에 audit 컬럼이 보이지 않더라도 실제 테이블에서 유지해야 하는 audit 컬럼이 무엇인지
- 표준 타입/문법을 그대로 사용할지, PostgreSQL 구현 타입(예: `JSONB`) 으로 조정할지
- `user`, `order`, `group`, `comment` 등 예약어 또는 혼동 가능 이름과 충돌하지 않는지

---

### 3.2 컬럼명 변경 또는 속성 변경

컬럼명 변경, 타입 변경, 길이 변경, NULL/NOT NULL 변경, DEFAULT 변경 등은 원칙적으로 `ALTER TABLE` 문으로 처리한다.

적용 예:

- 컬럼명 변경
- `VARCHAR(50)` -> `VARCHAR(100)`
- `NULL` 허용 -> `NOT NULL`
- 기본값 추가 또는 변경

주의 사항:

- 데이터 타입 변경 시 기존 데이터가 새 타입으로 안전하게 변환되는지 확인한다.
- `NOT NULL` 로 변경할 경우 기존 NULL 데이터를 먼저 정리해야 한다.
- 인덱스, FK, 체크 제약조건, 애플리케이션 코드 영향도 함께 검토한다.

---

### 3.3 신규 컬럼 추가

신규 컬럼 추가는 데이터 존재 여부에 따라 절차를 구분한다.

#### 3.3.1 데이터가 없는 경우

테이블에 데이터가 없으면 다음 절차를 따른다.

1. 기존 테이블 삭제
2. 변경된 구조로 테이블 재생성
3. 테이블명은 기존과 동일하게 유지

적용 기준:

- 초기 개발 단계
- seed 또는 demo 데이터만 있고 보존 필요가 없는 경우
- 운영/공유 환경이 아닌 경우

주의 사항:

- 삭제 전 정말 데이터가 없는지 재확인한다.
- 관련 index, constraint, sequence, comment 도 함께 최신 정의로 재생성한다.

#### 3.3.2 데이터가 있는 경우

테이블에 데이터가 있으면 기존 테이블을 직접 삭제하지 않고, 백업 후 신규 테이블 생성 및 데이터 이관 절차를 따른다.

권장 절차:

1. 기존 테이블 이름 변경
   예: `table_name -> table_name_bak`
2. 변경된 구조로 신규 테이블 생성
   예: 원래 이름인 `table_name` 으로 생성
3. 백업 테이블 데이터를 신규 테이블로 이관
4. 검증 완료 후 백업 테이블 보존 여부를 DBA와 협의

이관 시 주의 사항:

- 추가된 컬럼이 `NOT NULL` 이면 반드시 값 공급 방식이 필요하다.
- 값 공급 방식은 다음 중 하나를 사용한다.
  - `DEFAULT` 값 지정
  - 일괄 고정값 입력
  - 레코드별 매핑값 입력
  - 사용자 또는 업무 담당자에게 값을 받아 반영
- 신규 제약조건 때문에 이관 실패가 없는지 사전 검토한다.
- 이관 후 건수 비교, NULL 여부, 주요 샘플 데이터 검증을 수행한다.

---

## 4. 작성 파일 원칙

테이블 변경 작업 시 아래 파일 또는 SQL 묶음을 분리하여 작성한다.

파일은 기본적으로 `locaville/docs/ddl-sql` 아래에 저장한다.

또한 개별 테이블 DDL 또는 migration 파일을 수정한 경우, 통합 테이블 생성 스크립트인 다음 파일도 함께 최신 상태로 유지해야 한다.

- `master_create_locaville_tables.sql`
- `master_create_locaville_views.sql`  (View 변경 시)

### 4.1 최신 기준 CREATE TABLE DDL

목적:

- 해당 테이블의 "현재 정본" 을 유지하기 위함
- 신규 환경 구축 시 바로 사용할 수 있는 최신 DDL 확보

포함 내용:

- `CREATE TABLE`
- PK / FK / UNIQUE / CHECK
- INDEX
- SEQUENCE
- COMMENT 가 있다면 포함

이 파일은 원 테이블의 최신 구조를 나타내는 기준 문서로 관리한다.

추가 원칙:

- 개별 테이블 DDL이 변경되면 `master_create_locaville_tables.sql` 도 함께 업데이트한다.
- `master_create_locaville_tables.sql` 은 전체 테이블의 최신 생성 기준을 모아 둔 마스터 스크립트로 간주한다.

### 4.2 실제 변경 및 이관 SQL

목적:

- 기존 DB를 현재 상태에서 목표 상태로 안전하게 변경하기 위함

변경 유형별 작성 기준:

#### 4.2.1 단순 컬럼 변경인 경우

`ALTER TABLE` 기반 SQL 작성

예:

- 컬럼명 변경
- 타입/길이 변경
- NULL/NOT NULL 변경
- DEFAULT 변경

#### 4.2.2 단순 컬럼 추가인 경우

데이터가 없는 테이블이면 Drop 후 Create 방식의 DDL 작성 가능

예:

- `DROP TABLE`
- 최신 `CREATE TABLE`

단, 실제 적용 전 데이터 없음이 확인된 경우에만 사용한다.

#### 4.2.3 데이터 이관이 포함되는 경우

아래 순서가 모두 포함된 SQL 또는 절차 문서를 작성한다.

1. 기존 테이블 백업 SQL
2. 신규 테이블 생성 SQL
3. 데이터 이관 SQL
4. 필요 시 기본값/보정값 업데이트 SQL
5. 검증용 조회 SQL

예시 흐름:

```sql
ALTER TABLE sample_table RENAME TO sample_table_bak;

CREATE TABLE sample_table (
  ...
);

INSERT INTO sample_table (
  col1,
  col2,
  new_col
)
SELECT
  col1,
  col2,
  'DEFAULT_VALUE' AS new_col
FROM sample_table_bak;
```

---

## 4.3 파일 명명 규칙

`locaville/docs/ddl-sql` 폴더의 기존 파일명을 기준으로 아래 규칙을 사용한다.

현재 사용 중인 예시:

- `farm_job_ddl.sql`
- `master_create_locaville_tables.sql`
- `master_create_locaville_views.sql`
- `rag_heading_insert.sql`
- `rag_heading_migration_20260610.sql`
- `rag_heading_rule_migration_20260611.sql`

권장 규칙:

### 4.3.1 최신 테이블 정의 DDL

형식:

`{table_name}_ddl.sql`

예:

- `farm_job_ddl.sql`
- `notification_ddl.sql`

용도:

- 최신 기준의 `CREATE TABLE` 정본 관리

### 4.3.2 기준 데이터 또는 초기 데이터 입력 SQL

형식:

`{table_name}_insert.sql`

예:

- `rag_heading_insert.sql`
- `notification_insert.sql`

용도:

- 기준 데이터, seed 성격 데이터, 초기 rule 데이터 입력

### 4.3.3 마이그레이션 SQL

형식:

`{table_name}_migration_YYYYMMDD.sql`

예:

- `rag_heading_migration_20260610.sql`
- `notification_migration_20260615.sql`

용도:

- 기존 DB를 목표 스키마로 변경하는 실제 적용 SQL
- 백업, 생성, ALTER, 이관, 보정 SQL 포함 가능

### 4.3.4 하위 개념 또는 보조 테이블

테이블명이 길거나 하위 엔티티가 있으면 현재 폴더 관례처럼 snake_case 전체 이름을 그대로 파일명에 반영한다.

예:

- `rag_heading_rule_ddl.sql`
- `rag_heading_rule_insert.sql`
- `rag_heading_rule_migration_20260611.sql`

명명 시 주의 사항:

- 파일명은 모두 소문자 snake_case 사용
- 공백 사용 금지
- 날짜가 포함되는 migration 파일은 `YYYYMMDD` 8자리 고정
- `final`, `new`, `last` 같은 의미 불명확한 접미사는 사용하지 않음
- 한 파일에는 가능한 한 하나의 목적만 담는다

### 4.3.5 마스터 스크립트 파일

형식:

- `master_create_locaville_tables.sql`
- `master_create_locaville_views.sql`

용도:

- 전체 테이블 또는 뷰의 최신 생성 기준을 한 번에 관리
- 신규 환경 구축 또는 기준 스키마 검토 시 사용

관리 원칙:

- 개별 테이블 DDL 변경 시 관련 내용이 마스터 파일에도 반영되어야 한다.
- 마스터 파일과 개별 DDL 파일 간 정의가 서로 다르면 안 된다.

---

## 4.4 권장 파일 구성 예시

예를 들어 `notification` 테이블을 변경한다면 아래처럼 구성한다.

- `notification_ddl.sql`
  - 최신 CREATE TABLE 정본
- `notification_migration_20260615.sql`
  - 실제 변경 SQL
- `notification_insert.sql`
  - 필요 시 기준 데이터 입력
- 관련 spec 문서
  - 컬럼 정의, 업무 규칙, 기본값 정책

---

## 5. 실제 작업 체크리스트

작업 전 체크:

- 대상 테이블 데이터 존재 여부 확인
- 백업 필요 여부 확인
- 신규 컬럼의 NULL/NOT NULL 정책 확인
- DEFAULT 값 필요 여부 확인
- 코드 영향 범위 확인
- 기존 인덱스 유지 여부 및 변경 필요성 확인
- 표준 SQL 과 PostgreSQL 구현 차이 반영 필요 여부 확인
- 신규/변경 테이블명과 컬럼명이 소문자 규칙을 따르는지 확인
- 신규/변경 컬럼명이 예약어와 충돌하는지 확인

작업 중 체크:

- 백업 테이블 정상 생성 여부 확인
- 신규 테이블 DDL 정상 생성 여부 확인
- 데이터 이관 성공 여부 확인
- 오류 발생 시 롤백 또는 재실행 방안 확보

작업 후 체크:

- 원본/신규 테이블 건수 비교
- 신규 컬럼 값 검증
- 주요 기능 smoke test
- 관련 문서와 최신 DDL 파일 업데이트
- `master_create_locaville_tables.sql` 반영 여부 확인
- 인덱스 변경이 있었다면 사전 협의 내용과 실제 반영 결과 일치 여부 확인
- PostgreSQL 전용 조정 사항이 있다면 사전 확인 내용과 실제 반영 결과 일치 여부 확인
- ERD Cloud 모델 반영 여부 확인
- 변경된 테이블 구조 캡처를 문서 또는 협의 자료에 첨부

ERD 반영 원칙:

- 테이블 구조 변경이 완료되면 ERD Cloud 에 동일 내용을 반영한다.
- 반영 후 변경된 테이블 구조가 보이도록 캡처를 남긴다.
- ERD Cloud 캡처에 표시된 논리 컬럼명은 실제 DB 컬럼 `COMMENT` 로도 관리하는 것을 원칙으로 한다.
- 단, ERD Cloud 내 테이블 구조는 audit 컬럼을 생략한 표현을 사용할 수 있으며, 이 경우에도 실제 DB의 audit 컬럼은 기존 규칙대로 유지한다.
- 캡처는 DBA 협의 문서, spec 문서, 변경 보고 메모 중 하나에 첨부한다.

---

## 6. AI Agent / Prompt Context 용 요약

아래 문구는 AI agent 에게 그대로 전달 가능한 작업 기준이다.

```text
테이블 변경 작업 시 다음 원칙을 따른다.

1. 먼저 기존 테이블 구조와 데이터 존재 여부를 확인한다.
2. 컬럼명 변경 또는 속성 변경은 ALTER TABLE 로 처리한다.
3. 신규 컬럼 추가 시:
   - 데이터가 없으면 기존 테이블을 삭제하고 같은 이름으로 최신 DDL 기준 재생성한다.
   - 데이터가 있으면 기존 테이블을 *_bak 로 백업한 뒤, 원래 이름으로 신규 테이블을 생성하고 데이터를 이관한다.
4. 신규 컬럼이 NOT NULL 이면 DEFAULT 값 또는 레코드별 입력값을 반드시 정의한다.
5. 항상 두 종류의 산출물을 작성한다.
   - 최신 기준 CREATE TABLE DDL
   - 실제 변경/이관 SQL
6. 데이터 이관이 포함되면 백업, 생성, 이관, 보정, 검증 SQL 을 모두 포함한다.
7. 적용 전후로 데이터 건수와 주요 컬럼 값을 검증한다.
8. 개별 테이블 변경 시 `master_create_locaville_tables.sql` 도 함께 업데이트한다.
9. 변경 완료 후 ERD Cloud 에 반영하고, 변경된 테이블 구조 캡처를 첨부한다.
10. 기존 인덱스는 유지하되, 개선안이 있으면 사전 질의/협의 후 반영한다.
11. ERD Cloud 에 audit 컬럼이 생략되어 있어도 실제 테이블의 audit 컬럼은 유지한다.
12. 표준 SQL 과 PostgreSQL 구현 차이(예: `JSON` 과 `JSONB`) 는 최소 범위로만 반영하고, 사전 확인 후 수정한다.
13. 테이블명과 컬럼명은 소문자를 사용하고, 예약어 충돌 시 다른 이름을 제안한다.
```

---

## 7. 권장 산출물 예시

- `table_name.sql`
  - 최신 기준 CREATE TABLE DDL
- `table_name_migration_YYYYMMDD.sql`
  - 실제 변경 SQL
- `table_name_migration_check_YYYYMMDD.sql`
  - 변경 후 검증 SQL
- `master_create_locaville_tables.sql`
  - 전체 테이블 기준 생성 스크립트 동기화
- 관련 spec 문서
  - 컬럼 정의, 목적, 기본값 정책, 이관 규칙

실무 권장 파일명은 아래 형태를 우선 사용한다.

- `{table_name}_ddl.sql`
- `{table_name}_insert.sql`
- `{table_name}_migration_YYYYMMDD.sql`
- 필요 시 `{table_name}_migration_check_YYYYMMDD.sql`

---

## 8. 결론

테이블 변경은 단순 DDL 수정이 아니라 데이터 보존, 복구 가능성, 애플리케이션 영향까지 포함하는 작업이다. 따라서 변경 유형을 먼저 구분하고, 최신 DDL과 실제 변경 SQL을 분리해 관리하며, 데이터 존재 시에는 반드시 백업과 이관 절차를 포함해야 한다.
