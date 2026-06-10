CREATE TYPE project_status AS ENUM ('draft', 'registered', 'baseline', 'active', 'completed', 'closed');

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  methodology VARCHAR(100) NOT NULL,
  status project_status NOT NULL DEFAULT 'draft',
  area_hectares DECIMAL(12, 2) NOT NULL,
  credit_token_address VARCHAR(56),
  contract_id VARCHAR(56),
  baseline_start_date TIMESTAMPTZ,
  baseline_end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_owner ON projects (owner_id);
CREATE INDEX idx_projects_status ON projects (status);
CREATE INDEX idx_projects_methodology ON projects (methodology);

CREATE TABLE project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  ipfs_uri VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_documents_project ON project_documents (project_id);
