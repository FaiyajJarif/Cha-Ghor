package com.chaghor.chaghor.fieldcase;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;

// One message in a case's conversation thread. Typically the admin's response
// to a worker / supervisor, but the model is symmetric so either side can post.
// Author identity is snapshotted (name + role) like FieldCase.
@Entity
@Table(name = "case_reply")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CaseReply {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "case_id", nullable = false)
    private Long caseId;

    @Column(name = "author_name", nullable = false, length = 120)
    @Builder.Default
    private String authorName = "";

    @Column(name = "author_role", nullable = false, length = 30)
    @Builder.Default
    private String authorRole = "";

    @Column(name = "author_id")
    private Long authorId;

    @Column(name = "body", nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String body = "";

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;
}
