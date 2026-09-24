package com.chaghor.chaghor.sms;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SmsLogRepository extends JpaRepository<SmsLog, Long> {

    // Most recent messages first, for the admin SMS log view.
    List<SmsLog> findTop50ByOrderBySentAtDesc();

    // Has this broadcast already gone out? Guards a double-tap on Send from
    // texting every worker twice.
    long countByCaseId(Long caseId);

    List<SmsLog> findByCaseIdOrderByIdAsc(Long caseId);

    // One worker's own messages, newest first — the backing for the payment
    // notifications in the worker console.
    //
    // WHY THIS AND NOT A NEW notifications TABLE: the estate already writes a
    // row here every time it tells a worker something, and that row is the
    // message that was actually sent. A parallel table would be a second
    // account of the same event, free to drift from it — a worker could see
    // "you have been paid" in the app while no SMS row exists to evidence it,
    // or the reverse. Reading the log back means the notification and the text
    // on their phone cannot disagree, because they are the same record.
    List<SmsLog> findTop20ByWorkerIdOrderBySentAtDesc(Long workerId);
}
