-- Migration: 006_governance_enhancements
-- Adds a proposal_votes join table to track individual votes, and extends
-- governance_config with the full parameter set described in the schema.
--
-- Run after 005_create_oracle_submissions.sql

-- ─── 1. Extend governance_config ──────────────────────────────────────────────
-- Add water-quality threshold columns and credit-weighting columns that the
-- oracle uses for scoring.  Columns are nullable so existing rows are not
-- broken before the values are back-filled.

ALTER TABLE governance_config
  ADD COLUMN IF NOT EXISTS ph_min         NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS ph_max         NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS do_threshold   NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS temp_penalty_delta   NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS weight_volumetric    NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS weight_nitrogen      NUMERIC(5,4) NOT NULL DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS weight_phosphorus    NUMERIC(5,4) NOT NULL DEFAULT 0.2,
  ADD COLUMN IF NOT EXISTS updated_by    VARCHAR(56);

-- Back-fill sensible defaults
UPDATE governance_config SET
  ph_min = 6.0,
  ph_max = 9.0,
  do_threshold = 5.0,
  temp_penalty_delta = 2.0
WHERE id = 1;

-- ─── 2. Extend proposals ──────────────────────────────────────────────────────
-- Track the Stellar transaction hash when a proposal is executed, and record
-- which wallet performed the execution.

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS execution_tx_hash  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS executed_by        VARCHAR(56),
  ADD COLUMN IF NOT EXISTS executed_at        TIMESTAMPTZ;

-- ─── 3. Proposal votes table ──────────────────────────────────────────────────
-- Stores one row per (voter, proposal) so we can:
--   a) prevent double-voting at DB level (UNIQUE constraint)
--   b) expose per-voter history via the API
--   c) recount votes from raw data rather than the mutable counter columns

CREATE TABLE IF NOT EXISTS proposal_votes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  voter_wallet  VARCHAR(56) NOT NULL,
  support       BOOLEAN NOT NULL,         -- TRUE = vote for, FALSE = vote against
  weight        BIGINT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id, voter_wallet)
);

CREATE INDEX IF NOT EXISTS idx_proposal_votes_proposal ON proposal_votes (proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_votes_voter    ON proposal_votes (voter_wallet);

-- ─── 4. Governance event log ──────────────────────────────────────────────────
-- Immutable audit trail: every state change to proposals and config is logged.

CREATE TABLE IF NOT EXISTS governance_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  VARCHAR(50) NOT NULL,   -- e.g. 'proposal_created', 'vote_cast', 'config_updated'
  actor       VARCHAR(56),            -- Stellar wallet of the actor (NULL for system events)
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_governance_events_type      ON governance_events (event_type);
CREATE INDEX IF NOT EXISTS idx_governance_events_actor     ON governance_events (actor);
CREATE INDEX IF NOT EXISTS idx_governance_events_created   ON governance_events (created_at DESC);
