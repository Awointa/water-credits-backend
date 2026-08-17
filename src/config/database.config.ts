import { registerAs } from '@nestjs/config';
import { readFileSync } from 'fs';

export interface DatabaseSslOptions {
  rejectUnauthorized: boolean;
  ca?: Buffer;
}

export default registerAs('database', () => {
  const sslEnabled = process.env.DATABASE_SSL === 'true';
  let ssl: DatabaseSslOptions | undefined;

  if (sslEnabled) {
    ssl = {
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
    };
    const caPath = process.env.DATABASE_SSL_CA;
    if (caPath) {
      ssl.ca = readFileSync(caPath);
    }
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'water_credits',
    ssl,
  };
});
