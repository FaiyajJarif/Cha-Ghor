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
}
