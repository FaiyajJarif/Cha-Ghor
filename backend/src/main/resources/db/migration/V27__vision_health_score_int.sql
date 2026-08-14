-- ============================================================
-- V27 — fix the health_score column type
--
-- V26 declared health_score as SMALLINT. The JPA entity maps it to a Java
-- Integer, which Hibernate expects to be a Postgres `integer` (int4), so
-- schema validation refused to start:
--
--   wrong column type encountered in column [health_score] in table
--   [vision_inference]; found [int2 (SMALLINT)], but expecting [integer]
--
-- That failure cascades: entityManagerFactory -> userRepository ->
-- customUserDetailsService -> jwtAuthFilter, and Tomcat never starts. A single
-- column type takes the whole application down, which is worth remembering.
--
-- WHY WIDEN THE COLUMN RATHER THAN NARROW THE JAVA:
-- SMALLINT is the tighter fit for a 0-100 score, so `Short` would arguably be
-- the more correct Java type. But every other small integer in this codebase is
-- an Integer, `Short` is awkward to work with, and it would mean touching the
-- entity, the service and the DTO. Two bytes per row is not worth three files
-- and an inconsistency.
--
-- V26 is NOT edited. It has already run against this database, and changing an
-- applied migration alters its checksum, after which Flyway refuses to start.
-- ============================================================

ALTER TABLE vision_inference
    ALTER COLUMN health_score TYPE INTEGER;

-- The 0-100 CHECK from V26 survives the type change and still applies.
