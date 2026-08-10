package com.chaghor.chaghor.worker;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface WorkerRepository extends JpaRepository<Worker, Long> {

    // The join the entire worker console rests on: signed-in user -> their own
    // worker row. `workers.user_id` has existed since V1 and was never read.
    //
    // `deletedAt IS NULL` matters here as much as anywhere: a retired worker's
    // account must not still open a live console, but their payroll history has
    // to survive, which is why the row is kept rather than deleted.
    java.util.Optional<Worker> findFirstByUserIdAndDeletedAtIsNull(Long userId);

    // (existsByPhone was replaced by existsByPhoneAndDeletedAtIsNull below --
    //  a retired worker must not reserve a phone number forever.)

    // Case-insensitive search over name or phone. :q is ALWAYS a non-null String
    // (the service passes "" for "no filter"), so an empty value matches everyone
    // via LIKE '%%'. We deliberately avoid a `:q IS NULL` branch: a null bind
    // parameter has no type, and PostgreSQL then infers `bytea`, which makes
    // `lower(?)` fail with "function lower(bytea) does not exist". COALESCE guards
    // the nullable phone column so null phones don't drop out unexpectedly.
    // `deletedAt IS NULL` keeps retired workers out of the Workforce list while
    // leaving their row (and therefore their payroll history) intact.
    @Query("""
            SELECT w FROM Worker w
            WHERE w.deletedAt IS NULL
              AND (LOWER(w.fullName) LIKE LOWER(CONCAT('%', :q, '%'))
               OR LOWER(COALESCE(w.phone, '')) LIKE LOWER(CONCAT('%', :q, '%')))
            ORDER BY w.fullName ASC
            """)
    List<Worker> search(@Param("q") String q);

    // Exact (case-insensitive) name match, used to wire loan.worker_id from the
    // free-text worker name captured on a loan request. Returns the first match.
    //
    // Deliberately NOT filtered by deletedAt: this resolves a name to an id, and
    // a retired worker's old loan must still resolve to the right person.
    java.util.Optional<Worker> findFirstByFullNameIgnoreCase(String fullName);

    // Live workers only. Used wherever the question is "who works here now"
    // rather than "who does this historical record belong to".
    List<Worker> findByDeletedAtIsNull();

    // A retired worker must not block re-using their phone number.
    boolean existsByPhoneAndDeletedAtIsNull(String phone);
}
