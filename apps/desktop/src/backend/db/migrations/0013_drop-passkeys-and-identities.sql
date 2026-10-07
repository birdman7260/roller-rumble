-- A racer's only identity is the device login their phone holds (ADR-0024): passkeys, email
-- sign-in, and accountless device ids are gone, so their tables go too.
DROP INDEX IF EXISTS passkey_credentials_racer_idx;

DROP TABLE IF EXISTS passkey_credentials;

DROP TABLE IF EXISTS identities;
