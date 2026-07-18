-- Migration: 007_governance_vote_unique_on_chain_id
-- Depends on: 006_governance_enhancements.sql
--
-- 1. Guarantees the UNIQUE(proposal_id, voter_wallet) constraint exists on
--    proposal_votes (006 already creates the table with this constraint; this
--    migration is a safety net if the table was created without it, e.g. via
--    TypeORM synchronize: true in a development environment).
--
-- 2. Adds the on_chain_proposal_id column to proposals so executeProposal()
--    can supply the u32 identifier required by the Soroban governance contract.
--
-- 3. Adds execution audit columns (execution_tx_hash, executed_by, executed_at)
--    that were referenced in 006 but are listed here explicitly so that
--    environments which skipped them in 006 receive them now.

-- ─── 1. proposal_votes unique constraint ─────────────────────────────────────

-- Re-create the unique constraint under a stable name so we can reference it
-- in error messages and future migrations.  If the unnamed constraint already
-- exists from the CREATE TABLE in 006, PostgreSQL will silently skip the ADD
-- CONSTRAINT (IF NOT EXISTS) form.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'proposal_votes'::regclass
       AND contype   = 'u'
       AND conname   = 'uq_proposal_votes_proposal_voter'
  ) THEN
    ALTER TABLE proposal_votes
      ADD CONSTRAINT uq_proposal_votes_proposal_voter
        UNIQUE (proposal_id, voter_wallet);
  END IF;
END;
$$;

-- ─── 2. proposals.on_chain_proposal_id ───────────────────────────────────────
-- Maps the off-chain UUID proposal to the u32 identifier stored in the Soroban
-- governance contract.  Nullable because the value is only known after the
-- on-chain propose() transaction is confirmed (or set manually for proposals
-- migrated from a prior system).

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS on_chain_proposal_id INTEGER;

-- ─── 3. Execution audit columns (idempotent ADD IF NOT EXISTS) ───────────────

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS execution_tx_hash VARCHAR(100),
  ADD COLUMN IF NOT EXISTS executed_by        VARCHAR(56),
  ADD COLUMN IF NOT EXISTS executed_at        TIMESTAMPTZ;

-- Index to help the admin UI look up proposals by on-chain ID.
CREATE INDEX IF NOT EXISTS idx_proposals_on_chain_id
  ON proposals (on_chain_proposal_id)
  WHERE on_chain_proposal_id IS NOT NULL;
