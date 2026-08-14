package com.chaghor.chaghor.inventory;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;

public interface InventoryRepository extends JpaRepository<InventoryItem, Long> {

    // Paginated item list with optional category + free-text (name / code) filter.
    // Empty-string sentinels keep every bind parameter typed as text and let a
    // blank value mean "no filter" (same pattern as the finance ledger search).
    @Query(value = """
        SELECT * FROM inventory_item e
        WHERE (:category = '' OR e.category = :category)
          AND (:q = '' OR lower(e.name) LIKE lower('%' || :q || '%')
                       OR lower(COALESCE(e.code_value, '')) LIKE lower('%' || :q || '%'))
        ORDER BY e.name ASC, e.id ASC
        """,
        countQuery = """
        SELECT count(*) FROM inventory_item e
        WHERE (:category = '' OR e.category = :category)
          AND (:q = '' OR lower(e.name) LIKE lower('%' || :q || '%')
                       OR lower(COALESCE(e.code_value, '')) LIKE lower('%' || :q || '%'))
        """,
        nativeQuery = true)
    Page<InventoryItem> search(@Param("category") String category,
                               @Param("q") String q,
                               Pageable pageable);

    // Item count grouped by storage site, biggest first (Distribution donut).
    @Query(value = """
        SELECT site AS \"label\", COUNT(*) AS \"count\"
        FROM inventory_item
        GROUP BY site
        ORDER BY COUNT(*) DESC, site ASC
        """, nativeQuery = true)
    List<SiteAgg> distribution();

    // Items added recently -> the "+N" delta pill on the Total Items KPI.
    long countByCreatedAtAfter(OffsetDateTime t);

    interface SiteAgg {
        String getLabel();
        long getCount();
    }
}
