import { registerAs } from '@nestjs/config';

export default registerAs('oracle', () => ({
  contractId: process.env.ORACLE_CONTRACT_ID || '',
  trustedSigners: (process.env.ORACLE_TRUSTED_SIGNERS || '').split(',').filter(Boolean),
}));
