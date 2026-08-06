package com.chaghor.chaghor.fieldcase;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FieldCaseRepository extends JpaRepository<FieldCase, Long> {

    List<FieldCase> findAllByOrderByCreatedAtDesc();

    List<FieldCase> findByCaseTypeOrderByCreatedAtDesc(CaseType caseType);
}
