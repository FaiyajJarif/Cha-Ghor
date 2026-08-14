-- Adds a job role to each worker (plucker, maintenance, sprayer, ...).
-- VARCHAR (not a Postgres enum) so new roles can be added without a type change.
ALTER TABLE workers
    ADD COLUMN job_role VARCHAR(30) NOT NULL DEFAULT 'plucker';
