CREATE TYPE user_role AS ENUM ('admin', 'project_owner', 'oracle', 'verifier', 'farmer');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet VARCHAR(56) NOT NULL UNIQUE,
  email VARCHAR(255),
  display_name VARCHAR(100),
  role user_role NOT NULL DEFAULT 'farmer',
  is_kyc_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  refresh_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_wallet ON users (wallet);
CREATE INDEX idx_users_role ON users (role);
