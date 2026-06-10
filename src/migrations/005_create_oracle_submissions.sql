CREATE TYPE submission_status AS ENUM ('pending', 'submitted', 'confirmed', 'failed');

CREATE TABLE oracle_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  oracle_address VARCHAR(56) NOT NULL,
  nonce INT NOT NULL,
  tx_hash VARCHAR(100) NOT NULL,
  status submission_status NOT NULL DEFAULT 'pending',
  readings_snapshot JSONB NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, oracle_address, nonce)
);

CREATE INDEX idx_oracle_submissions_project ON oracle_submissions (project_id);
CREATE INDEX idx_oracle_submissions_status ON oracle_submissions (status);

CREATE TYPE proposal_status AS ENUM ('active', 'passed', 'rejected', 'executed', 'expired');

CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer VARCHAR(56) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  action_type VARCHAR(50) NOT NULL,
  action_params JSONB,
  votes_for BIGINT NOT NULL DEFAULT 0,
  votes_against BIGINT NOT NULL DEFAULT 0,
  status proposal_status NOT NULL DEFAULT 'active',
  deadline TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposals_proposer ON proposals (proposer);
CREATE INDEX idx_proposals_status ON proposals (status);

CREATE TABLE governance_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  protocol_fee_bps INT NOT NULL DEFAULT 100,
  min_oracle_confirmations INT NOT NULL DEFAULT 3,
  voting_period INT NOT NULL DEFAULT 604800,
  timelock_period INT NOT NULL DEFAULT 86400,
  quorum INT NOT NULL DEFAULT 3,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO governance_config (id, protocol_fee_bps, min_oracle_confirmations, voting_period, timelock_period, quorum)
VALUES (1, 100, 3, 604800, 86400, 3);
