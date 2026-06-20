-- Converted from MySQL DDL to Supabase PostgreSQL-compatible DDL
-- Source date: 2026-05-25

-- Table structure for table act_grp
--

DROP TABLE IF EXISTS public.act_grp CASCADE;
CREATE TABLE public.act_grp (
  group_no integer NOT NULL,
  amo_regno varchar(15) NOT NULL,
  prj_id varchar(15) NOT NULL,
  activity_id varchar(15) NOT NULL,
  start_date date DEFAULT NULL,
  end_date date DEFAULT NULL,
  act_progress varchar(16) default null,
  active_yn char(1) not null default 'Y',
  remark varchar(255) DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (group_no,amo_regno,prj_id,activity_id)
 );

create index if not exists idx_act_grp_prj
  on public.act_grp (prj_id, activity_id);

create index if not exists idx_act_grp_amo
  on public.act_grp (amo_regno, prj_id);

--

-- Table structure for table act_grp_parcel
--

DROP TABLE IF EXISTS public.act_grp_parcel CASCADE;
create table public.act_grp_parcel (
  group_no integer not null,
  amo_regno varchar(15) not null,
  prj_id varchar(15) not null,
  activity_id varchar(15) not null,
  parcel_no integer not null,

  start_date date default null,
  end_date date default null,
  parcel_progress varchar(16) default null,
  active_yn char(1) not null default 'Y',
  remark varchar(255) default null,

  reg_dt timestamp with time zone not null default current_timestamp,
  reg_no integer default null,
  mod_dt timestamp with time zone default null,
  mod_no integer default null,

  primary key (group_no, amo_regno, prj_id, activity_id, parcel_no)
);

create index if not exists idx_act_grp_parcel_prj
  on public.act_grp_parcel (prj_id, activity_id);

create index if not exists idx_act_grp_parcel_amo
  on public.act_grp_parcel (amo_regno, prj_id);

create index if not exists idx_act_grp_parcel_parcel
  on public.act_grp_parcel (amo_regno, parcel_no);


--

-- Table structure for table amo_family
--

DROP TABLE IF EXISTS public.amo_family CASCADE;
CREATE TABLE public.amo_family (
  amo_regno varchar(15) NOT NULL,
  ville_id varchar(15) NOT NULL,
  amo_name varchar(32) NOT NULL,
  chief_no integer NOT NULL,
  zip_cd varchar(8) NOT NULL,
  addr_1 varchar(128) NOT NULL,
  addr_2 varchar(128) DEFAULT NULL,
  phone_no varchar(15) NOT NULL,
  co_regno varchar(15) DEFAULT NULL,
  tax_regno varchar(15) DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (amo_regno)
 );

--

-- Table structure for table code_detail
--

DROP TABLE IF EXISTS public.code_detail CASCADE;
CREATE TABLE public.code_detail (
  code varchar(8) NOT NULL,
  grp_cd varchar(8) NOT NULL,
  code_name varchar(32) NOT NULL,
  code_desc varchar(255) DEFAULT NULL,
  sort_order integer DEFAULT NULL,
  parent_cd varchar(8) DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (grp_cd,code)
 );

--

-- Table structure for table code_group
--

DROP TABLE IF EXISTS public.code_group CASCADE;
CREATE TABLE public.code_group (
  grp_cd varchar(8) NOT NULL,
  grp_name varchar(32) NOT NULL,
  grp_desc varchar(255) DEFAULT NULL,
  use_yn char(1) NOT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (grp_cd)
 );

--

-- Table structure for table evidence
--

DROP TABLE IF EXISTS public.evidence CASCADE;
CREATE TABLE public.evidence (
  group_no integer NOT NULL,
  amo_regno varchar(15) NOT NULL,
  user_no integer NOT NULL,
  seq_no integer NOT NULL,
  job_date date NOT NULL,
  exec_no integer NOT NULL,
  gps_lat numeric(8,5) NOT NULL,
  gps_long numeric(8,5) NOT NULL,
  capture_dt timestamp with time zone NOT NULL,
  ai_label varchar(128) DEFAULT NULL,
  evid_cd varchar(8) NOT NULL,
  file_path varchar(255) NOT NULL,
  raw_json jsonb DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (user_no,job_date,exec_no,seq_no)
 );

--

-- Table structure for table farm_job
--

DROP TABLE IF EXISTS public.farm_job CASCADE;
CREATE TABLE public.farm_job (
  job_cd varchar(8) NOT NULL,
  job_name varchar(32) NOT NULL,
  job_desc varchar(255) DEFAULT NULL,
  job_cat varchar(32) DEFAULT NULL,
  start_mmdd char(4) DEFAULT NULL,
  end_mmdd char(4) DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  CONSTRAINT pk_farm_job PRIMARY KEY (job_cd)
);

COMMENT ON TABLE public.farm_job IS '영농작업';
COMMENT ON COLUMN public.farm_job.job_cd IS '작업코드';
COMMENT ON COLUMN public.farm_job.job_name IS '작업명';
COMMENT ON COLUMN public.farm_job.job_desc IS '작업설명';
COMMENT ON COLUMN public.farm_job.job_cat IS '작업구분';
COMMENT ON COLUMN public.farm_job.start_mmdd IS '시작월일';
COMMENT ON COLUMN public.farm_job.end_mmdd IS '마감월일';
COMMENT ON COLUMN public.farm_job.reg_dt IS '최초 등록 시각';
COMMENT ON COLUMN public.farm_job.reg_no IS '최초 등록자 식별값';
COMMENT ON COLUMN public.farm_job.mod_dt IS '최종 수정 시각';
COMMENT ON COLUMN public.farm_job.mod_no IS '최종 수정자 식별값';

--

-- Table structure for table farmer
--

DROP TABLE IF EXISTS public.farmer CASCADE;
CREATE TABLE public.farmer (
  user_no integer NOT NULL,
  amo_regno varchar(15) NOT NULL,
  ville_id varchar(15) NOT NULL,
  farmer_regno varchar(15) DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (user_no)
 );

--

-- Table structure for table group_member
--

DROP TABLE IF EXISTS public.group_member CASCADE;
CREATE TABLE public.group_member (
  group_no integer NOT NULL,
  amo_regno varchar(15) NOT NULL,
  relation varchar(8) DEFAULT NULL,
  role varchar(255) DEFAULT NULL,
  join_date date DEFAULT NULL,
  active_yn char(1) DEFAULT NULL,
  retire_date date DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (group_no,amo_regno)
 );

--

-- Table structure for table journal
--

DROP TABLE IF EXISTS public.journal CASCADE;
CREATE TABLE public.journal (
  user_no integer NOT NULL,
  job_date date NOT NULL,
  exec_no integer NOT NULL,
  exec_desc varchar(255) DEFAULT NULL,
  job_cd varchar(8) NOT NULL,
  amo_regno varchar(15) NOT NULL,
  ai_result_json jsonb DEFAULT NULL,
  input_type_cd varchar(8) DEFAULT NULL,
  job_cmpl_yn char(1) DEFAULT NULL,
  parcel_no integer DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (user_no,job_date,exec_no)
 );

--

-- Table structure for table login_history
--

DROP TABLE IF EXISTS public.login_history CASCADE;
CREATE TABLE public.login_history (
  user_no integer NOT NULL,
  login_dt timestamp with time zone NOT NULL,
  login_path varchar(8) DEFAULT NULL,
  resp_key varchar(255) DEFAULT NULL,
  success_yn char(1) NOT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (user_no,login_dt)
 );

--

-- Table structure for table parcel
--

DROP TABLE IF EXISTS public.parcel CASCADE;
CREATE TABLE public.parcel (
  amo_regno varchar(15) NOT NULL,
  parcel_no integer NOT NULL,
  parcel_name varchar(32) default null,
  area numeric(18,2) NOT NULL,
  usage varchar(8) NOT NULL,
  zip_cd varchar(8) DEFAULT NULL,
  addr_1 varchar(128) DEFAULT NULL,
  addr_2 varchar(128) DEFAULT NULL,
  parcel_regno varchar(32) DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (amo_regno,parcel_no)
 );

--

-- Table structure for table prj_activity
--

DROP TABLE IF EXISTS public.prj_activity CASCADE;
CREATE TABLE public.prj_activity (
  prj_id varchar(15) NOT NULL,
  activity_id varchar(15) NOT NULL,
  activity_name varchar(32) DEFAULT NULL,
  est_start_date date DEFAULT NULL,
  est_end_date date DEFAULT NULL,
  subsidy_amt decimal(12,2) NOT NULL,
  activity_rule jsonb DEFAULT NULL,
  description varchar(512) DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  CONSTRAINT prj_activity_pkey PRIMARY KEY (prj_id,activity_id)
 );

COMMENT ON TABLE public.prj_activity IS '프로젝트 활동 정보';
COMMENT ON COLUMN public.prj_activity.prj_id IS '프로젝트ID';
COMMENT ON COLUMN public.prj_activity.activity_id IS '활동ID';
COMMENT ON COLUMN public.prj_activity.activity_name IS '활동명';
COMMENT ON COLUMN public.prj_activity.est_start_date IS '예정시작일';
COMMENT ON COLUMN public.prj_activity.est_end_date IS '예정종료일';
COMMENT ON COLUMN public.prj_activity.subsidy_amt IS '활동지원비';
COMMENT ON COLUMN public.prj_activity.activity_rule IS '활동규칙JSON';
COMMENT ON COLUMN public.prj_activity.description IS '활동내역';
COMMENT ON COLUMN public.prj_activity.reg_dt IS '최초 등록 시각';
COMMENT ON COLUMN public.prj_activity.reg_no IS '최초 등록자 식별값';
COMMENT ON COLUMN public.prj_activity.mod_dt IS '최종 수정 시각';
COMMENT ON COLUMN public.prj_activity.mod_no IS '최종 수정자 식별값';

--

-- Table structure for table prj_act_parcel
--

-- 1. 기존 테이블이 존재할 경우 삭제 (public 스키마 지정)
DROP TABLE IF EXISTS public.prj_act_parcel;

-- 2. 활동별대상농지 테이블 생성 (public 스키마 지정)
CREATE TABLE public.prj_act_parcel (
    prj_id VARCHAR(15) NOT NULL,
    activity_id VARCHAR(15) NOT NULL,
    code VARCHAR(8) NOT NULL,
    -- DEFAULT 제약조건으로 INSERT 시 자동으로 'PARCEL' 주입
    grp_cd VARCHAR(8) DEFAULT 'PARCEL' NOT NULL,
    
    -- 복합 기본키(PK) 구성
    CONSTRAINT pk_prj_act_parcel PRIMARY KEY (prj_id, activity_id, code, grp_cd),
    
    -- CHECK 제약조건으로 'PARCEL' 외의 잘못된 데이터 입력 원천 차단
    CONSTRAINT chk_prj_act_parcel_grp CHECK (grp_cd = 'PARCEL')
);

-- 3. 테이블 및 컬럼 주석(Comment) 추가 (public 스키마 지정)
COMMENT ON TABLE public.prj_act_parcel IS '활동별대상농지';
COMMENT ON COLUMN public.prj_act_parcel.prj_id IS '프로젝트ID';
COMMENT ON COLUMN public.prj_act_parcel.activity_id IS '활동ID';
COMMENT ON COLUMN public.prj_act_parcel.code IS '코드';
COMMENT ON COLUMN public.prj_act_parcel.grp_cd IS '그룹코드';

--

-- Table structure for table prj_grp
--

DROP TABLE IF EXISTS public.prj_grp CASCADE;
CREATE TABLE public.prj_grp (
  group_no integer NOT NULL,
  prj_id varchar(15) NOT NULL,
  leader_no integer DEFAULT NULL,
  ville_id varchar(15) NOT NULL,
  apply_date date DEFAULT NULL,
  apprv_date date DEFAULT NULL,
  cmpl_date date DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (group_no,prj_id)
 );

--

-- Table structure for table prj_job
--

DROP TABLE IF EXISTS public.prj_job CASCADE;
CREATE TABLE public.prj_job (
  prj_id varchar(15) NOT NULL,
  activity_id varchar(15) NOT NULL,
  job_seq integer NOT NULL,
  job_cd varchar(8) NOT NULL,
  exec_point_cd varchar(8) DEFAULT NULL,
  prior_job_cd varchar(8) DEFAULT NULL,
  start_date_rule varchar(255) DEFAULT NULL,
  end_date_rule varchar(255) DEFAULT NULL,
  est_start_date date DEFAULT NULL,
  est_end_date date DEFAULT NULL,
  mandatory_yn char(1) DEFAULT NULL,
  evidence_yn char(1) DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (prj_id,activity_id,job_seq)
 );

--

-- Table structure for table prj_journal
--

DROP TABLE IF EXISTS public.prj_journal CASCADE;
CREATE TABLE public.prj_journal (
  user_no integer NOT NULL,
  job_date date NOT NULL,
  exec_no integer NOT NULL,
  job_cd varchar(8) NOT NULL,
  group_no integer NOT NULL,
  amo_regno varchar(15) NOT NULL,
  prj_id varchar(15) NOT NULL,
  activity_id varchar(15) NOT NULL,
  job_seq integer NOT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (user_no,job_date,exec_no)
 );

--

-- Table structure for table prj_todo_list
--

DROP TABLE IF EXISTS public.prj_todo_list CASCADE;
CREATE TABLE public.prj_todo_list (
  group_no integer NOT NULL,
  amo_regno varchar(15) NOT NULL,
  prj_id varchar(15) NOT NULL,
  activity_id varchar(15) NOT NULL,
  job_seq integer NOT NULL,
  job_cd varchar(8) NOT NULL,
  est_start_date date DEFAULT NULL,
  real_start_date date DEFAULT NULL,
  est_end_date date DEFAULT NULL,
  real_end_date date DEFAULT NULL,
  job_progress varchar(8) DEFAULT NULL,
  remark varchar(255) DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (group_no,amo_regno,prj_id,activity_id,job_seq)
 );

--

-- Table structure for table program_master
--

DROP TABLE IF EXISTS public.program_master CASCADE;
CREATE TABLE public.program_master (
  biz_id varchar(15) NOT NULL,
  biz_name varchar(32) DEFAULT NULL,
  biz_manager varchar(32) DEFAULT NULL,
  biz_overview varchar(255) DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (biz_id)
 );

--

-- Table structure for table project
--

DROP TABLE IF EXISTS public.project CASCADE;
CREATE TABLE public.project (
  prj_id varchar(15) NOT NULL,
  prj_name varchar(32) DEFAULT NULL,
  exec_year integer DEFAULT NULL,
  biz_id varchar(15) NOT NULL,
  post_date date DEFAULT NULL,
  issuer varchar(32) DEFAULT NULL,
  rag_file_id text DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (prj_id)
 );

COMMENT ON TABLE public.project IS '프로젝트(실행사업) 기본 정보';
COMMENT ON COLUMN public.project.prj_id IS '프로젝트ID';
COMMENT ON COLUMN public.project.prj_name IS '프로젝트명';
COMMENT ON COLUMN public.project.exec_year IS '시행연도';
COMMENT ON COLUMN public.project.biz_id IS '사업ID';
COMMENT ON COLUMN public.project.post_date IS '공고일자';
COMMENT ON COLUMN public.project.issuer IS '발주기관';
COMMENT ON COLUMN public.project.rag_file_id IS 'RAG파일ID. RAG 문서 기반으로 등록된 프로젝트일 경우 연결되는 rag_file.file_id';
COMMENT ON COLUMN public.project.reg_dt IS '최초 등록 시각';
COMMENT ON COLUMN public.project.reg_no IS '최초 등록자 식별값';
COMMENT ON COLUMN public.project.mod_dt IS '최종 수정 시각';
COMMENT ON COLUMN public.project.mod_no IS '최종 수정자 식별값';

--

-- Table structure for table rag_heading_rule
--

DROP TABLE IF EXISTS public.rag_file CASCADE;
DROP TABLE IF EXISTS public.rag_heading CASCADE;
DROP TABLE IF EXISTS public.rag_heading_rule CASCADE;

CREATE TABLE public.rag_heading_rule (
  rule_id text NOT NULL,
  rule_name text NOT NULL,
  rule_type text NOT NULL,
  notation text NOT NULL,
  notation_display text DEFAULT NULL,
  pattern_text text DEFAULT NULL,
  rule_options jsonb DEFAULT NULL,
  active_yn character(1) NOT NULL DEFAULT 'Y',
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  CONSTRAINT rag_heading_rule_pkey PRIMARY KEY (rule_id),
  CONSTRAINT rag_heading_rule_active_yn_chk CHECK (active_yn IN ('Y', 'N'))
);

COMMENT ON TABLE public.rag_heading_rule IS 'RAG heading 규칙 원문 저장 테이블';
COMMENT ON COLUMN public.rag_heading_rule.rule_id IS '규칙 식별자. heading_schema.levels[].rule_id 에서 참조하는 고유 키';
COMMENT ON COLUMN public.rag_heading_rule.rule_name IS '관리자/개발자용 규칙 표시명';
COMMENT ON COLUMN public.rag_heading_rule.rule_type IS '파서 분기용 규칙 유형 예: numeric_dot, korean_letter_dot, roman, appendix_title_table';
COMMENT ON COLUMN public.rag_heading_rule.notation IS '관리자 UI 표시용 대표 표기 예: 1., 가., ①, Ⅰ, 참고 n | 제목';
COMMENT ON COLUMN public.rag_heading_rule.notation_display IS '사용자에게 보여줄 표기 예시 예: 1, 2, 3... / 가, 나, 다...';
COMMENT ON COLUMN public.rag_heading_rule.pattern_text IS '백슬래시/유니코드 포함 regex 원문 보존용';
COMMENT ON COLUMN public.rag_heading_rule.rule_options IS '파서 rule_type 해석용 옵션 JSON';
COMMENT ON COLUMN public.rag_heading_rule.active_yn IS '규칙 사용 여부. Y=사용, N=미사용';

--

-- Table structure for table rag_heading
--

CREATE TABLE public.rag_heading (
  heading_id text NOT NULL,
  heading_name text NOT NULL,
  heading_summary text NOT NULL,
  heading_schema jsonb NOT NULL,
  body_yn character(1) NOT NULL DEFAULT 'Y',
  active_yn character(1) NOT NULL DEFAULT 'Y',
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  CONSTRAINT rag_heading_pkey PRIMARY KEY (heading_id),
  CONSTRAINT rag_heading_body_yn_chk CHECK (body_yn IN ('Y', 'N')),
  CONSTRAINT rag_heading_active_yn_chk CHECK (active_yn IN ('Y', 'N'))
);

COMMENT ON TABLE public.rag_heading IS 'RAG heading 템플릿 마스터';
COMMENT ON COLUMN public.rag_heading.heading_id IS '템플릿 식별자. 앱과 관리 화면에서 사용하는 고유 키';
COMMENT ON COLUMN public.rag_heading.heading_name IS '관리자/사용자 화면 표시용 템플릿 이름';
COMMENT ON COLUMN public.rag_heading.heading_summary IS '관리자 UI 표시용 축약 표기 예: Ⅰ > 1. > 가.';
COMMENT ON COLUMN public.rag_heading.heading_schema IS 'rule_id 참조형 heading schema JSON';
COMMENT ON COLUMN public.rag_heading.body_yn IS '본문 템플릿 여부. Y=body/main heading, N=appendix heading';
COMMENT ON COLUMN public.rag_heading.active_yn IS '템플릿 사용 여부. Y=사용, N=미사용';
COMMENT ON COLUMN public.rag_heading.reg_dt IS '최초 등록 시각';
COMMENT ON COLUMN public.rag_heading.reg_no IS '최초 등록자 식별값';
COMMENT ON COLUMN public.rag_heading.mod_dt IS '최종 수정 시각';
COMMENT ON COLUMN public.rag_heading.mod_no IS '최종 수정자 식별값';
COMMENT ON COLUMN public.rag_heading.heading_schema IS
'예시:
{
  "hierarchy_type": "ko_government",
  "levels": [
    {
      "depth": 1,
      "rule_id": "numeric_dot_1",
      "notation": "1.",
      "location": "paragraph",
      "rule_options": {
        "segments": 1,
        "trailing_dot": "required",
        "leading_space_max": 10,
        "trailing_space_max": 3
      }
    },
    {
      "depth": 2,
      "rule_id": "korean_letter_dot",
      "notation": "가.",
      "location": "paragraph",
      "rule_options": {
        "letter_range": "가-히",
        "trailing_dot": "required",
        "leading_space_max": 10,
        "trailing_space_max": 3
      }
    }
  ]
}';

--

-- Table structure for table rag_file
--

CREATE TABLE public.rag_file (
  file_id text NOT NULL,
  file_name text NOT NULL,
  file_path text DEFAULT NULL,
  format_type text NOT NULL,
  doc_name text NOT NULL,
  doc_cat text NOT NULL,
  doc_version numeric(10, 2) NOT NULL DEFAULT 1.0,
  publication_date date DEFAULT NULL,
  doc_number text DEFAULT NULL,
  doc_manager text DEFAULT NULL,
  embedding_yn character(1) NOT NULL DEFAULT 'N',
  ref_heading_id text DEFAULT NULL,
  ref_appendix_id text DEFAULT NULL,
  heading_schema jsonb NOT NULL,
  appendix_schema jsonb DEFAULT NULL,
  body_exit_criteria jsonb DEFAULT NULL,
  appendix_exit_criteria jsonb DEFAULT NULL,
  schema_note text DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  CONSTRAINT rag_file_pkey PRIMARY KEY (file_id),
  CONSTRAINT rag_file_embedding_yn_chk CHECK (embedding_yn IN ('Y', 'N')),
  CONSTRAINT rag_file_ref_heading_id_fk FOREIGN KEY (ref_heading_id) REFERENCES public.rag_heading (heading_id),
  CONSTRAINT rag_file_ref_appendix_id_fk FOREIGN KEY (ref_appendix_id) REFERENCES public.rag_heading (heading_id)
);

COMMENT ON TABLE public.rag_file IS '등록된 RAG 원본문서 메타 및 문서별 body/appendix schema 저장';
COMMENT ON COLUMN public.rag_file.ref_heading_id IS '참조 body heading 템플릿 ID';
COMMENT ON COLUMN public.rag_file.ref_appendix_id IS '참조 appendix heading 템플릿 ID';
COMMENT ON COLUMN public.rag_file.heading_schema IS '문서별 body heading schema(rule_id + override 저장 구조)';
COMMENT ON COLUMN public.rag_file.appendix_schema IS '문서별 appendix heading schema(rule_id + override 저장 구조)';
COMMENT ON COLUMN public.rag_file.body_exit_criteria IS 'body 모드 종료 또는 appendix 진입/전환 판단용 문서별 override 기준 JSON. 초기값 NULL';
COMMENT ON COLUMN public.rag_file.appendix_exit_criteria IS 'appendix 모드 종료 후 body 복귀 판단용 문서별 override 기준 JSON. 초기값 NULL';

--

-- Table structure for table user_master
--

DROP TABLE IF EXISTS public.user_master CASCADE;
CREATE TABLE public.user_master (
  user_no integer GENERATED BY DEFAULT AS IDENTITY,
  user_name varchar(32) NOT NULL,
  login_id varchar(15) DEFAULT NULL,
  phone_no varchar(15) NOT NULL,
  zip_cd varchar(8) DEFAULT NULL,
  addr_1 varchar(128) DEFAULT NULL,
  addr_2 varchar(128) DEFAULT NULL,
  auth_key varchar(255) DEFAULT NULL,
  email varchar(64) DEFAULT NULL,
  status_cd varchar(8) DEFAULT NULL,
  password char(60) DEFAULT NULL,
  farmer_regno varchar(15) DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (user_no)
 );

ALTER TABLE public.user_master
  ALTER COLUMN user_no RESTART WITH 10000101;

--

-- Table structure for table village
--

DROP TABLE IF EXISTS public.village CASCADE;
CREATE TABLE public.village (
  ville_id varchar(15) NOT NULL,
  ville_name varchar(32) NOT NULL,
  chief_no integer NOT NULL,
  zip_cd varchar(8) NOT NULL,
  addr_1 varchar(128) NOT NULL,
  addr_2 varchar(128) DEFAULT NULL,
  phone_no varchar(15) DEFAULT NULL,
  nx integer NOT NULL,
  ny integer NOT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (ville_id)
 );

--

-- Table structure for table ville_group
--

DROP TABLE IF EXISTS public.ville_group CASCADE;
CREATE TABLE public.ville_group (
  group_no integer GENERATED BY DEFAULT AS IDENTITY,
  group_name varchar(32) NOT NULL,
  group_type_cd varchar(8) NOT NULL,
  group_regno varchar(15) NOT NULL,
  chief_no integer NOT NULL,
  zip_cd varchar(8) DEFAULT NULL,
  addr_1 varchar(128) DEFAULT NULL,
  addr_2 varchar(128) DEFAULT NULL,
  phone_no varchar(15) DEFAULT NULL,
  ville_id varchar(15) NOT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (group_no)
 );

ALTER TABLE public.ville_group
  ALTER COLUMN group_no RESTART WITH 100011;

--

-- Table structure for table weather
--

DROP TABLE IF EXISTS public.weather CASCADE;
CREATE TABLE public.weather (
  w_nx integer NOT NULL,
  w_ny integer NOT NULL,
  w_date date NOT NULL,
  w_hour integer NOT NULL,
  w_status varchar(15) NOT NULL,
  sky_cd integer NOT NULL,
  pty_cd integer NOT NULL,
  temperature numeric(4,1) DEFAULT NULL,
  humidity integer DEFAULT NULL,
  precip_prob integer DEFAULT NULL,
  rain_hour varchar(15) DEFAULT NULL,
  snow_hour varchar(15) DEFAULT NULL,
  update_dt timestamp with time zone DEFAULT NULL,
  reg_dt timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reg_no integer DEFAULT NULL,
  mod_dt timestamp with time zone DEFAULT NULL,
  mod_no integer DEFAULT NULL,
  PRIMARY KEY (w_nx,w_ny,w_date,w_hour)
 );

--

