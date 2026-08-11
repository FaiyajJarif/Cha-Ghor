package com.chaghor.chaghor.settlement;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface WageOverdrawRepository extends JpaRepository<WageOverdraw, Long> {

    // Still being worked off. Oldest first, so a worker clears the earliest
    // correction before a later one -- the same order a person would expect
    // and the only order that makes "which day is this for" answerable.
    @Query("""
           select o from WageOverdraw o
           where o.workerId = :workerId and o.recovered < o.amount
           order by o.workDate asc, o.id asc
           """)
    List<WageOverdraw> findOpenByWorker(@Param("workerId") Long workerId);

    List<WageOverdraw> findByWorkerIdOrderByIdAsc(Long workerId);
}
