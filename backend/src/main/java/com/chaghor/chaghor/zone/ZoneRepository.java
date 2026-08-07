package com.chaghor.chaghor.zone;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ZoneRepository extends JpaRepository<Zone, Long> {

    // Live fields only — what every picker, map and board should show.
    java.util.List<Zone> findByArchivedAtIsNullOrderByNameAsc();

    // Guards the unique-code rule in the service so the user gets a sentence
    // rather than a database constraint violation.
    java.util.Optional<Zone> findFirstByCodeIgnoreCaseAndArchivedAtIsNull(String code);

}
