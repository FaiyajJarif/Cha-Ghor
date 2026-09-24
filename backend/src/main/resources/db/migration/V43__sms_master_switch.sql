-- V43: an SMS master switch, and a separate switch for automatic notices.
--
-- ============================================================================
-- WHY THIS HAD TO EXIST BEFORE A REAL PROVIDER WAS TURNED ON
-- ============================================================================
--
-- Until now every provider was a stub or a mock -- MockSmsSender logged and
-- did nothing. So it did not matter that TWO code paths send SMS with no
-- confirmation step at all:
--
--   PayrollService.markPaid()      -> notifyPayrollClosed(...)
--   WithdrawalService.decide()     -> notifyWithdrawalStatus(...)
--
-- The moment a real transport is configured, those become real messages on a
-- real SIM with real credit. Marking a cycle of 50 payslips paid would fire 50
-- texts, silently, from one button press. Nobody asked for that and nobody
-- would see it coming.
--
-- (The third path, BroadcastSmsService, already has an explicit confirm screen
-- showing the exact characters and the exact recipient count. It is not the
-- problem; these two are.)
--
-- ============================================================================
-- TWO SWITCHES, NOT ONE, AND BOTH DEFAULT TO FALSE
-- ============================================================================
--
--   sms_enabled      Master. FALSE means nothing is transmitted by any path,
--                    including broadcasts. Rows are still written to sms_log
--                    with status 'mock', so the console still shows what WOULD
--                    have gone out. This is the kill switch.
--
--   sms_auto_notify  Whether the two automatic notices above may fire. Separate
--                    because "let me send a storm warning to a field" and "text
--                    every worker automatically whenever I close a payslip" are
--                    different decisions with different costs. An admin can arm
--                    SMS for a demo broadcast without arming payroll blasts.
--
-- DEFAULT FALSE on both is the whole point: turning on a provider must never be
-- enough on its own to start spending money. Somebody has to make a second,
-- deliberate choice in the admin console.
--
-- app_setting is the existing single-row estate settings table (id = 1), so
-- this needs no new table and no new plumbing.

ALTER TABLE app_setting
    ADD COLUMN IF NOT EXISTS sms_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS sms_auto_notify BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN app_setting.sms_enabled IS
    'Master SMS switch. FALSE = nothing is transmitted; sms_log still records '
    'what would have been sent, with status mock. Defaults FALSE so configuring '
    'a provider cannot by itself start spending SIM credit.';

COMMENT ON COLUMN app_setting.sms_auto_notify IS
    'Whether payroll-closed and withdrawal-status notices may send automatically. '
    'Separate from sms_enabled so broadcasts can be armed without also arming a '
    'text to every worker each time a payslip is closed.';
