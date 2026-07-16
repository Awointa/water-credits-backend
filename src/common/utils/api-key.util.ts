import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

/**
 * Generates a new sensor-device API key and its bcrypt hash.
 *
 * Key format:  wc_<deviceId>_<32-byte-hex-secret>
 * The plaintext key is returned once and never stored; only the hash
 * is persisted on the SensorDevice entity.
 */
export async function generateDeviceApiKey(deviceId: string): Promise<{
  plaintext: string;
  hash: string;
}> {
  const secret = crypto.randomBytes(32).toString('hex');
  const plaintext = `wc_${deviceId}_${secret}`;
  const hash = await bcrypt.hash(secret, BCRYPT_ROUNDS);
  return { plaintext, hash };
}

/**
 * Verifies a plaintext API key against a stored hash.
 * Extracts the secret segment (last underscore-delimited part) before comparing.
 */
export async function verifyDeviceApiKey(plaintext: string, hash: string): Promise<boolean> {
  const parts = plaintext.split('_');
  if (parts.length < 3) {
    return false;
  }
  const secret = parts[parts.length - 1];
  return bcrypt.compare(secret, hash);
}
