package com.chaghor.chaghor.vision;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VisionInferenceRepository extends JpaRepository<VisionInference, Long> {

    // Photo URLs for a page of weigh-ins, in ONE query. Resolving these row by
    // row would be a query per entry on every day-sheet load.
    List<VisionInference> findByIdIn(java.util.Collection<Long> ids);

    // The training set: every reading a human has ruled on, newest first.
    List<VisionInference> findByReviewedAtIsNotNullOrderByReviewedAtDesc(Pageable pageable);

    // Recent reads of one subject, newest first — how the grader has been doing.
    List<VisionInference> findBySubjectTypeOrderByIdDesc(VisionSubject subjectType, Pageable pageable);
}
