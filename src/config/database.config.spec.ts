import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import databaseConfig from './database.config';

describe('databaseConfig', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DATABASE_SSL;
    delete process.env.DATABASE_SSL_CA;
    delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('leaves ssl undefined when DATABASE_SSL is not set', () => {
    expect(databaseConfig().ssl).toBeUndefined();
  });

  it('leaves ssl undefined when DATABASE_SSL is "false"', () => {
    process.env.DATABASE_SSL = 'false';
    expect(databaseConfig().ssl).toBeUndefined();
  });

  it('enables ssl with rejectUnauthorized true when DATABASE_SSL=true', () => {
    process.env.DATABASE_SSL = 'true';
    expect(databaseConfig().ssl).toEqual({ rejectUnauthorized: true });
  });

  it('sets rejectUnauthorized false when DATABASE_SSL_REJECT_UNAUTHORIZED=false', () => {
    process.env.DATABASE_SSL = 'true';
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = 'false';
    expect(databaseConfig().ssl).toEqual({ rejectUnauthorized: false });
  });

  it('loads the CA certificate from DATABASE_SSL_CA when provided', () => {
    const caDir = mkdtempSync(join(tmpdir(), 'wc-ca-'));
    const caPath = join(caDir, 'ca.pem');
    const caContent = '-----BEGIN CERTIFICATE-----\nMOCK_CA\n-----END CERTIFICATE-----';
    writeFileSync(caPath, caContent);
    process.env.DATABASE_SSL = 'true';
    process.env.DATABASE_SSL_CA = caPath;
    try {
      expect(databaseConfig().ssl).toEqual({
        rejectUnauthorized: true,
        ca: readFileSync(caPath),
      });
    } finally {
      rmSync(caDir, { recursive: true, force: true });
    }
  });

  it('preserves the default connection settings', () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USERNAME;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_DATABASE;
    const config = databaseConfig();
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(5432);
    expect(config.username).toBe('postgres');
    expect(config.password).toBe('postgres');
    expect(config.database).toBe('water_credits');
  });
});
