-- View definitions aligned to the parcel-aware project journal structure
-- Source date: 2026-05-29

-- farmer_full_view
-- farmer를 기준으로 user_master의 사용자 상세정보를 함께 조회한다.

DROP VIEW IF EXISTS public.farmer_full_view;

CREATE VIEW public.farmer_full_view AS
SELECT
    f.user_no,
    f.amo_regno,
    f.farmer_regno,
    f.ville_id,
    u.user_name,
    u.login_id,
    u.phone_no,
    u.zip_cd,
    u.addr_1,
    u.addr_2,
    u.auth_key,
    u.email,
    u.status_cd,
    u.passwd
FROM public.farmer f
INNER JOIN public.user_master u
    ON f.user_no = u.user_no;


-- user_full_view
-- user_master를 기준으로 farmer 정보를 선택적으로 결합한다.

DROP VIEW IF EXISTS public.user_full_view;

CREATE VIEW public.user_full_view AS
SELECT
    u.user_no,
    f.amo_regno,
    f.farmer_regno,
    f.ville_id,
    u.user_name,
    u.login_id,
    u.phone_no,
    u.zip_cd,
    u.addr_1,
    u.addr_2,
    u.auth_key,
    u.email,
    u.status_cd,
    u.passwd
FROM public.user_master u
LEFT JOIN public.farmer f
    ON u.user_no = f.user_no;


-- prj_journal_full_view
-- 프로젝트 일지 전용 상세 조회용 뷰.
-- journal 본문과 prj_journal의 프로젝트/필지 컨텍스트를 함께 보여준다.

DROP VIEW IF EXISTS public.prj_journal_full_view;

CREATE VIEW public.prj_journal_full_view AS
SELECT
    pj.user_no,
    pj.job_date,
    pj.exec_no,
    pj.group_no,
    pj.amo_regno,
    pj.prj_id,
    pj.activity_id,
    pj.parcel_no,
    pj.job_seq,
    pj.job_cd,
    j.exec_desc,
    j.ai_result_json,
    j.input_type_cd,
    j.job_cmpl_yn,
    j.parcel_no AS journal_parcel_no,
    CASE
        WHEN j.parcel_no IS NULL THEN 'NO_PARCEL'
        WHEN j.parcel_no <> pj.parcel_no THEN 'PARCEL_MISMATCH'
        ELSE 'OK'
    END AS parcel_match_status,
    j.reg_dt,
    j.reg_no,
    j.mod_dt,
    j.mod_no
FROM public.prj_journal pj
INNER JOIN public.journal j
    ON j.user_no = pj.user_no
   AND j.job_date = pj.job_date
   AND j.exec_no = pj.exec_no;


-- journal_full_view
-- 전체 영농일지를 기준으로 프로젝트 연결 여부를 함께 보여준다.

DROP VIEW IF EXISTS public.journal_full_view;

CREATE VIEW public.journal_full_view AS
SELECT
    j.user_no,
    j.job_date,
    j.exec_no,
    j.job_cd,
    j.amo_regno,
    j.parcel_no AS journal_parcel_no,
    j.exec_desc,
    j.ai_result_json,
    j.input_type_cd,
    j.job_cmpl_yn,
    pj.group_no,
    pj.prj_id,
    pj.activity_id,
    pj.parcel_no AS prj_parcel_no,
    pj.job_seq,
    CASE
        WHEN pj.user_no IS NULL THEN 'GENERAL'
        ELSE 'PROJECT'
    END AS journal_type,
    CASE
        WHEN pj.user_no IS NULL THEN 'NOT_APPLICABLE'
        WHEN j.parcel_no IS NULL THEN 'NO_PARCEL'
        WHEN j.parcel_no <> pj.parcel_no THEN 'PARCEL_MISMATCH'
        ELSE 'OK'
    END AS parcel_match_status,
    j.reg_dt,
    j.reg_no,
    j.mod_dt,
    j.mod_no
FROM public.journal j
LEFT JOIN public.prj_journal pj
    ON j.user_no = pj.user_no
   AND j.job_date = pj.job_date
   AND j.exec_no = pj.exec_no;


-- prj_todo_status_view
-- prj_todo_list 1건 단위의 실시간 진척 상태를 계산한다.
-- job_progress는 캐시이고, computed_* 컬럼이 실제 판정 기준이다.

DROP VIEW IF EXISTS public.prj_todo_status_view;

CREATE VIEW public.prj_todo_status_view AS
WITH journal_agg AS (
    SELECT
        pj.group_no,
        pj.amo_regno,
        pj.prj_id,
        pj.activity_id,
        pj.parcel_no,
        pj.job_seq,
        MIN(pj.job_date) AS first_job_date,
        MAX(pj.job_date) AS last_job_date,
        MAX(CASE WHEN j.job_cmpl_yn = 'Y' THEN pj.job_date END) AS completed_job_date,
        COUNT(DISTINCT (pj.user_no, pj.job_date, pj.exec_no)) AS journal_count
    FROM public.prj_journal pj
    INNER JOIN public.journal j
        ON j.user_no = pj.user_no
       AND j.job_date = pj.job_date
       AND j.exec_no = pj.exec_no
    GROUP BY
        pj.group_no,
        pj.amo_regno,
        pj.prj_id,
        pj.activity_id,
        pj.parcel_no,
        pj.job_seq
),
todo_base AS (
    SELECT
        t.group_no,
        t.amo_regno,
        t.prj_id,
        t.activity_id,
        t.parcel_no,
        t.job_seq,
        t.job_cd,
        t.est_start_date,
        t.real_start_date,
        t.est_end_date,
        t.real_end_date,
        t.job_progress,
        t.remark,
        pjob.mandatory_yn,
        pjob.evidence_yn
    FROM public.prj_todo_list t
    LEFT JOIN public.prj_job pjob
        ON pjob.prj_id = t.prj_id
       AND pjob.activity_id = t.activity_id
       AND pjob.job_seq = t.job_seq
)
SELECT
    tb.group_no,
    tb.amo_regno,
    tb.prj_id,
    tb.activity_id,
    tb.parcel_no,
    tb.job_seq,
    tb.job_cd,
    tb.est_start_date,
    tb.est_end_date,
    ja.first_job_date AS computed_start_date,
    ja.completed_job_date AS computed_end_date,
    ja.journal_count,
    tb.job_progress AS cached_job_progress,
    CASE
        WHEN ja.completed_job_date IS NOT NULL THEN 'completed'
        WHEN ja.first_job_date IS NOT NULL THEN 'in_progress'
        ELSE 'pending'
    END AS computed_job_status,
    CASE
        WHEN ja.completed_job_date IS NOT NULL THEN 'END'
        WHEN ja.first_job_date IS NOT NULL THEN 'ING'
        WHEN tb.est_start_date IS NOT NULL AND tb.est_start_date < CURRENT_DATE THEN 'DLY'
        ELSE 'PRE'
    END AS computed_job_progress,
    tb.mandatory_yn,
    tb.evidence_yn,
    tb.remark
FROM todo_base tb
LEFT JOIN journal_agg ja
    ON ja.group_no = tb.group_no
   AND ja.amo_regno = tb.amo_regno
   AND ja.prj_id = tb.prj_id
   AND ja.activity_id = tb.activity_id
   AND ja.parcel_no = tb.parcel_no
   AND ja.job_seq = tb.job_seq;


-- act_grp_parcel_status_view
-- 활동-필지 단위의 상태를 작업 단위 집계로 계산한다.

DROP VIEW IF EXISTS public.act_grp_parcel_status_view;

CREATE VIEW public.act_grp_parcel_status_view AS
SELECT
    ap.group_no,
    ap.amo_regno,
    ap.prj_id,
    ap.activity_id,
    ap.parcel_no,
    ap.start_date AS cached_start_date,
    ap.end_date AS cached_end_date,
    ap.parcel_progress AS cached_parcel_progress,
    ap.active_yn,
    ap.remark,
    MIN(ts.computed_start_date) AS computed_start_date,
    CASE
        WHEN SUM(CASE WHEN ts.computed_job_status = 'completed' THEN 1 ELSE 0 END) = COUNT(ts.job_seq)
        THEN MAX(ts.computed_end_date)
        ELSE NULL
    END AS computed_end_date,
    COUNT(ts.job_seq) AS total_job_count,
    SUM(CASE WHEN ts.computed_job_status = 'completed' THEN 1 ELSE 0 END) AS completed_job_count,
    SUM(CASE WHEN ts.computed_job_status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_job_count,
    SUM(CASE WHEN ts.computed_job_status = 'pending' THEN 1 ELSE 0 END) AS pending_job_count,
    CASE
        WHEN COUNT(ts.job_seq) = 0 THEN 'pending'
        WHEN SUM(CASE WHEN ts.computed_job_status = 'completed' THEN 1 ELSE 0 END) = COUNT(ts.job_seq) THEN 'completed'
        WHEN SUM(CASE WHEN ts.computed_job_status IN ('completed', 'in_progress') THEN 1 ELSE 0 END) > 0 THEN 'in_progress'
        ELSE 'pending'
    END AS computed_progress,
    ROUND(
        100.0 * SUM(CASE WHEN ts.computed_job_status = 'completed' THEN 1 ELSE 0 END)
        / NULLIF(COUNT(ts.job_seq), 0),
        1
    ) AS completion_rate
FROM public.act_grp_parcel ap
LEFT JOIN public.prj_todo_status_view ts
    ON ts.group_no = ap.group_no
   AND ts.amo_regno = ap.amo_regno
   AND ts.prj_id = ap.prj_id
   AND ts.activity_id = ap.activity_id
   AND ts.parcel_no = ap.parcel_no
GROUP BY
    ap.group_no,
    ap.amo_regno,
    ap.prj_id,
    ap.activity_id,
    ap.parcel_no,
    ap.start_date,
    ap.end_date,
    ap.parcel_progress,
    ap.active_yn,
    ap.remark;


-- act_grp_status_view
-- 활동 단위 상태를 활동-필지 상태 집계로 계산한다.

DROP VIEW IF EXISTS public.act_grp_status_view;

CREATE VIEW public.act_grp_status_view AS
SELECT
    ag.group_no,
    ag.amo_regno,
    ag.prj_id,
    ag.activity_id,
    ag.start_date AS cached_start_date,
    ag.end_date AS cached_end_date,
    ag.act_progress AS cached_act_progress,
    ag.active_yn,
    ag.remark,
    MIN(ps.computed_start_date) AS computed_start_date,
    CASE
        WHEN SUM(CASE WHEN ps.computed_progress = 'completed' THEN 1 ELSE 0 END) = COUNT(ps.parcel_no)
        THEN MAX(ps.computed_end_date)
        ELSE NULL
    END AS computed_end_date,
    COUNT(ps.parcel_no) AS total_parcel_count,
    SUM(CASE WHEN ps.computed_progress = 'completed' THEN 1 ELSE 0 END) AS completed_parcel_count,
    SUM(CASE WHEN ps.computed_progress = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_parcel_count,
    SUM(CASE WHEN ps.computed_progress = 'pending' THEN 1 ELSE 0 END) AS pending_parcel_count,
    CASE
        WHEN COUNT(ps.parcel_no) = 0 THEN 'pending'
        WHEN SUM(CASE WHEN ps.computed_progress = 'completed' THEN 1 ELSE 0 END) = COUNT(ps.parcel_no) THEN 'completed'
        WHEN SUM(CASE WHEN ps.computed_progress IN ('completed', 'in_progress') THEN 1 ELSE 0 END) > 0 THEN 'in_progress'
        ELSE 'pending'
    END AS computed_progress,
    ROUND(
        100.0 * SUM(CASE WHEN ps.computed_progress = 'completed' THEN 1 ELSE 0 END)
        / NULLIF(COUNT(ps.parcel_no), 0),
        1
    ) AS completion_rate
FROM public.act_grp ag
LEFT JOIN public.act_grp_parcel_status_view ps
    ON ps.group_no = ag.group_no
   AND ps.amo_regno = ag.amo_regno
   AND ps.prj_id = ag.prj_id
   AND ps.activity_id = ag.activity_id
GROUP BY
    ag.group_no,
    ag.amo_regno,
    ag.prj_id,
    ag.activity_id,
    ag.start_date,
    ag.end_date,
    ag.act_progress,
    ag.active_yn,
    ag.remark;


-- project_amo_status_view
-- 경영체별 프로젝트 전체 진척 요약 뷰.

DROP VIEW IF EXISTS public.project_amo_status_view;

CREATE VIEW public.project_amo_status_view AS
SELECT
    ag.amo_regno,
    ag.prj_id,
    COUNT(*) AS total_activity_count,
    SUM(CASE WHEN av.computed_progress = 'completed' THEN 1 ELSE 0 END) AS completed_activity_count,
    SUM(CASE WHEN av.computed_progress = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_activity_count,
    SUM(CASE WHEN av.computed_progress = 'pending' THEN 1 ELSE 0 END) AS pending_activity_count,
    CASE
        WHEN SUM(CASE WHEN av.computed_progress = 'completed' THEN 1 ELSE 0 END) = COUNT(*) THEN 'completed'
        WHEN SUM(CASE WHEN av.computed_progress IN ('completed', 'in_progress') THEN 1 ELSE 0 END) > 0 THEN 'in_progress'
        ELSE 'pending'
    END AS computed_progress,
    ROUND(
        100.0 * SUM(CASE WHEN av.computed_progress = 'completed' THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*), 0),
        1
    ) AS completion_rate
FROM public.act_grp ag
LEFT JOIN public.act_grp_status_view av
    ON av.group_no = ag.group_no
   AND av.amo_regno = ag.amo_regno
   AND av.prj_id = ag.prj_id
   AND av.activity_id = ag.activity_id
GROUP BY
    ag.amo_regno,
    ag.prj_id;
