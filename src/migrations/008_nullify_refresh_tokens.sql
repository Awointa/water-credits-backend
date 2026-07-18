-- 008_nullify_refresh_tokens.sql
-- Migration: Nullify all existing refresh_token values
--
-- BREAKING CHANGE: All active sessions are invalidated.
-- Users must re-authenticate to obtain a new refresh token.
--
-- Rationale: Refresh tokens are now stored as SHA-256 HMAC hashes
-- instead of plaintext JWTs. Existing plaintext tokens would fail
-- the new hash comparison and represent a security liability if
-- left in the database.

UPDATE users SET refresh_token = NULL;
