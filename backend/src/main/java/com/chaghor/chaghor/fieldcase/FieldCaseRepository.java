package com.chaghor.chaghor.fieldcase;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FieldCaseRepository extends JpaRepository<FieldCase, Long> {

    // A worker's own cases, newest first. `submitted_by` is indexed (V31).
    java.util.List<FieldCase> findBySubmittedByOrderByCreatedAtDesc(Long submittedBy);

    // Replay guard for complaints filed offline (V31). Two copies of the same
    // grievance is exactly the noise that makes a channel look unreliable.
    java.util.Optional<FieldCase> findFirstByClientUuid(java.util.UUID clientUuid);

    List<FieldCase> findAllByOrderByCreatedAtDesc();

    List<FieldCase> findByCaseTypeOrderByCreatedAtDesc(CaseType caseType);
}
