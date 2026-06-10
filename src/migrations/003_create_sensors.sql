CREATE TABLE sensor_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id VARCHAR(100) NOT NULL UNIQUE,
  manufacturer VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  parameters JSONB,
  public_key TEXT NOT NULL,
  last_reading_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sensor_devices_project ON sensor_devices (project_id);
CREATE INDEX idx_sensor_devices_device_id ON sensor_devices (device_id);

CREATE TYPE batch_status AS ENUM ('pending', 'submitted', 'confirmed', 'failed');

CREATE TABLE reading_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status batch_status NOT NULL DEFAULT 'pending',
  reading_count INT NOT NULL DEFAULT 0,
  credits_generated DECIMAL(20, 6),
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reading_batches_project ON reading_batches (project_id);
CREATE INDEX idx_reading_batches_status ON reading_batches (status);

CREATE TABLE sensor_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES sensor_devices(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  ph DECIMAL(10, 3),
  turbidity DECIMAL(10, 3),
  dissolved_oxygen DECIMAL(10, 3),
  flow_rate DECIMAL(10, 3),
  nitrogen DECIMAL(10, 3),
  phosphorus DECIMAL(10, 3),
  temperature DECIMAL(10, 3),
  signature TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  batch_id UUID REFERENCES reading_batches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sensor_readings_device ON sensor_readings (device_id);
CREATE INDEX idx_sensor_readings_project ON sensor_readings (project_id);
CREATE INDEX idx_sensor_readings_timestamp ON sensor_readings (timestamp);
CREATE INDEX idx_sensor_readings_batch ON sensor_readings (batch_id);
