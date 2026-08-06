package com.chaghor.chaghor.sms;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SmsLogRepository extends JpaRepository<SmsLog, Long> {

    // Most recent messages first, for the admin SMS log view.
    List<SmsLog> findTop50ByOrderBySentAtDesc();
}
