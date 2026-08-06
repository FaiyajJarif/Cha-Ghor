package com.chaghor.chaghor.settings;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;

// Single-row (id = 1) workspace / estate configuration.
@Entity
@Table(name = "app_setting")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AppSetting {

    @Id
    private Long id; // always 1

    @Column(name = "estate_name", nullable = false, length = 160)
    private String estateName;

    @Column(name = "logo_url", columnDefinition = "TEXT")
    private String logoUrl;

    @Column(nullable = false, length = 8)
    private String currency;

    @Column(name = "updated_by")
    private Long updatedBy;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
