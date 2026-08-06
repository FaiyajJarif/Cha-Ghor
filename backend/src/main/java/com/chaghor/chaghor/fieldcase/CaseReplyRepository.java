package com.chaghor.chaghor.fieldcase;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CaseReplyRepository extends JpaRepository<CaseReply, Long> {

    List<CaseReply> findByCaseIdOrderByCreatedAtAsc(Long caseId);

    void deleteByCaseId(Long caseId);
}
