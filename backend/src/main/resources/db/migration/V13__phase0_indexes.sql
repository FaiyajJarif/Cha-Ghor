-- ============================================================
-- V13 — Phase 0: supplementary indexes
-- Only indexes that DON'T already exist in V1..V12 are added.
-- Already present (do NOT recreate): idx_workers_zone,
--   idx_workers_supervisor, idx_attendance_worker, idx_attendance_date,
--   idx_leaf_worker, idx_leaf_date, idx_payroll_worker, idx_payroll_status,
--   idx_loans_worker, idx_loans_status, idx_loan_status.
-- ============================================================

-- Reverse-lookup a worker from their login account (used by /auth + RBAC).
CREATE INDEX IF NOT EXISTS idx_workers_user ON workers(user_id);

-- Withdrawal queue is filtered by worker and by status; no index existed.
CREATE INDEX IF NOT EXISTS idx_withdrawal_worker ON withdrawal_request(worker_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status ON withdrawal_request(status);

-- Payroll list screens are almost always "this worker, this status".
CREATE INDEX IF NOT EXISTS idx_payroll_worker_status ON payroll(worker_id, status);
