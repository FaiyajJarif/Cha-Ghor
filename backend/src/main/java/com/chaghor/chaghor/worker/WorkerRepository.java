package com.chaghor.chaghor.worker;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface WorkerRepository extends JpaRepository<Worker, Long> {

    boolean existsByPhone(String phone);

    // Case-insensitive search over name or phone. :q is ALWAYS a non-null String
    // (the service passes "" for "no filter"), so an empty value matches everyone
    // via LIKE '%%'. We deliberately avoid a `:q IS NULL` branch: a null bind
    // parameter has no type, and PostgreSQL then infers `bytea`, which makes
    // `lower(?)` fail with "function lower(bytea) does not exist". COALESCE guards
    // the nullable phone column so null phones don't drop out unexpectedly.
    @Query("""
            SELECT w FROM Worker w
            WHERE LOWER(w.fullName) LIKE LOWER(CONCAT('%', :q, '%'))
               OR LOWER(COALESCE(w.phone, '')) LIKE LOWER(CONCAT('%', :q, '%'))
            ORDER BY w.fullName ASC
            """)
    List<Worker> search(@Param("q") String q);

    // Exact (case-insensitive) name match, used to wire loan.worker_id from the
    // free-text worker name captured on a loan request. Returns the first match.
    java.util.Optional<Worker> findFirstByFullNameIgnoreCase(String fullName);
}
