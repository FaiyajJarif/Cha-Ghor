-- V12: Read-only curated views for the Cha Bot AI service.
-- The AI never queries base tables. It only sees these two views, and only
-- through the least-privilege `chabot_readonly` role
-- (see ai_service/sql/ai_readonly_setup.sql).
--
-- Sensitive columns (national_id, password hashes, tokens) are intentionally
-- NOT exposed here.

CREATE OR REPLACE VIEW view_worker AS
SELECT
    w.id            AS worker_id,
    w.full_name,
    w.name_bn,
    w.phone,
    w.job_role,     -- plucker | maintenance | sprayer | weeder | factory | other
    w.status,       -- active | on_leave | inactive
    w.daily_wage,
    w.join_date,
    w.dob,
    z.name          AS zone_name,
    z.code          AS zone_code,
    s.username      AS supervisor_username
FROM workers w
LEFT JOIN zones z ON z.id = w.zone_id
LEFT JOIN users s ON s.id = w.supervisor_id;

COMMENT ON VIEW view_worker IS 'Cha Bot: safe worker directory (no national_id).';

CREATE OR REPLACE VIEW view_attendance AS
SELECT
    a.id            AS attendance_id,
    a.work_date,
    a.status,       -- present | absent | leave
    w.id            AS worker_id,
    w.full_name,
    w.job_role,
    z.name          AS zone_name
FROM attendance a
JOIN workers w ON w.id = a.worker_id
LEFT JOIN zones z ON z.id = a.zone_id;

COMMENT ON VIEW view_attendance IS 'Cha Bot: attendance history with worker + zone names.';
