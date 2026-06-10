CREATE TABLE retirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  amount DECIMAL(20, 6) NOT NULL,
  purpose VARCHAR(255) NOT NULL,
  metadata_uri VARCHAR(255),
  tx_hash VARCHAR(100) NOT NULL,
  certificate_ipfs_uri VARCHAR(255),
  retired_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_retirements_user ON retirements (user_id);
CREATE INDEX idx_retirements_project ON retirements (project_id);
CREATE INDEX idx_retirements_retired_at ON retirements (retired_at);
