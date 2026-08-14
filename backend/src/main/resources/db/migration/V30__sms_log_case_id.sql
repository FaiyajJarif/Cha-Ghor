-- V30: tie an SMS to the broadcast that sent it.
--
-- WHY
--   Broadcasts can now go out as SMS to workers. Two things need this column:
--
--   1. A SECOND SEND MUST BE REFUSABLE. Texting forty workers costs money and
--      lands on real phones. Without a link from sms_log back to the case there
--      is nothing to check before sending, so a supervisor double-tapping
--      "Send" during a storm — exactly when they are rushed — would text
--      everyone twice. The idempotency note in SmsService says the existing
--      callers are safe because each is a single-shot state transition
--      (approved -> paid); a broadcast has no such transition to lean on, so it
--      needs a record.
--
--   2. Delivery has to be answerable per broadcast: "did that alert actually
--      reach anyone?" is the first thing someone asks after a storm.
--
-- Nullable, because every existing row — payroll and withdrawal notices — has
-- no case and never will. Only alert messages carry one.
--
-- No foreign key. sms_log is an append-only delivery record; if a case is ever
-- deleted the evidence that a message was sent to somebody's phone should
-- survive it, and ON DELETE SET NULL would quietly erase that link.
--
-- Append-only. V29 was the last applied migration.

ALTER TABLE sms_log ADD COLUMN IF NOT EXISTS case_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_sms_log_case_id ON sms_log (case_id) WHERE case_id IS NOT NULL;
