package com.chaghor.chaghor.leaf;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface LeafCollectionRepository extends JpaRepository<LeafCollection, Long> {

    // All plucks recorded on a given day (newest first), for the day sheet.
    List<LeafCollection> findByCollectDateOrderByIdDesc(LocalDate collectDate);

    // All plucks for one worker within an inclusive date range.
    List<LeafCollection> findByWorkerIdAndCollectDateBetween(
            Long workerId, LocalDate start, LocalDate end);

    long countByCollectDate(LocalDate collectDate);

    // Every weigh-in across a date range, for the collection trend chart. One
    // query for the whole window rather than fourteen per-day calls.
    List<LeafCollection> findByCollectDateBetween(LocalDate start, LocalDate end);
}
