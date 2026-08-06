package com.chaghor.chaghor.report;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

// One saved estate report (`saved_report`). A report snapshots the revenue /
// expense / net-profit rollup for a period plus a plain-language narrative, so
// it can be revisited later even as live data changes. Fresh table with a
// VARCHAR status (@Enumerated(STRING)) -- no native Postgres enum needed.
@Entity
@Table(name = "saved_report")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SavedReport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "title", nullable = false, length = 160)
    @Builder.Default
    private String title = "";

    @Column(name = "report_type", nullable = false, length = 30)
    @Builder.Default
    private String reportType = "MONTHLY";

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDate periodEnd;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private ReportStatus status = ReportStatus.DRAFT;

    @Column(name = "summary", columnDefinition = "TEXT")
    private String summary;

    @Column(name = "revenue", nullable = false)
    @Builder.Default
    private BigDecimal revenue = BigDecimal.ZERO;

    @Column(name = "expense", nullable = false)
    @Builder.Default
    private BigDecimal expense = BigDecimal.ZERO;

    @Column(name = "net_profit", nullable = false)
    @Builder.Default
    private BigDecimal netProfit = BigDecimal.ZERO;

    @Column(name = "generated_by")
    private Long generatedBy;

    @Column(name = "generated_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime generatedAt;

    @Column(name = "finalized_at")
    private OffsetDateTime finalizedAt;
}
