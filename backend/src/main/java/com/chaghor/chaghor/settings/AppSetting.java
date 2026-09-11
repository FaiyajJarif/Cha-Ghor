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

    // ---- SMS switches (V43) -------------------------------------------------
    //
    // Both default FALSE in the DATABASE and here, so a provider being
    // configured is never on its own enough to start sending. See V43 for why
    // there are two of them.
    //
    // @Builder.Default matters: without it Lombok's builder would leave these
    // null and the NOT NULL columns would reject the insert.
    @Builder.Default
    @Column(name = "sms_enabled", nullable = false)
    private boolean smsEnabled = false;

    @Builder.Default
    @Column(name = "sms_auto_notify", nullable = false)
    private boolean smsAutoNotify = false;

    @Column(name = "updated_by")
    private Long updatedBy;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
