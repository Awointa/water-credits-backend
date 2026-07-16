import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SorobanRpc, Keypair, Transaction, xdr } from '@stellar/stellar-sdk';

@Injectable()
export class StellarClient {
  private readonly logger = new Logger(StellarClient.name);
  private server: SorobanRpc.Server;
  private keypair: Keypair;

  constructor(private configService: ConfigService) {
    const rpcUrl = this.configService.get<string>('stellar.rpcUrl')!;
    const backendSecret = this.configService.get<string>('stellar.backendSecret');

    this.server = new SorobanRpc.Server(rpcUrl);

    if (backendSecret && backendSecret !== 'SDN...TODO') {
      this.keypair = Keypair.fromSecret(backendSecret);
    } else {
      this.logger.warn('STELLAR_BACKEND_SECRET not properly configured');
      // Using a random keypair just to avoid null checks, but transactions will fail
      this.keypair = Keypair.random();
    }
  }

  getServer(): SorobanRpc.Server {
    return this.server;
  }

  getKeypair(): Keypair {
    return this.keypair;
  }

  async simulateTx(tx: Transaction): Promise<SorobanRpc.Api.SimulateTransactionResponse> {
    return this.server.simulateTransaction(tx);
  }

  async prepareTx(tx: Transaction): Promise<Transaction> {
    return this.server.prepareTransaction(tx);
  }

  async sendTx(tx: Transaction): Promise<SorobanRpc.Api.GetTransactionResponse> {
    const response = await this.server.sendTransaction(tx);
    if (response.status === 'ERROR') {
      throw new Error(`Transaction failed: ${JSON.stringify(response)}`);
    }

    // Poll for status
    let statusResponse = await this.server.getTransaction(response.hash);
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      if (statusResponse.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        return statusResponse;
      }

      if (statusResponse.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Transaction failed: ${statusResponse.resultMetaXdr}`);
      }

      // If NOT_FOUND or any other status (like PENDING if applicable), wait and poll
      await new Promise((resolve) => setTimeout(resolve, 2000));
      statusResponse = await this.server.getTransaction(response.hash);
      attempts++;
    }

    throw new Error(`Transaction polling timed out for ${response.hash}`);
  }

  /**
   * Same as sendTx() but also returns the transaction hash from the initial
   * sendTransaction response so callers that need to persist the hash (e.g.
   * the oracle processor) can do so without a second RPC call.
   */
  async sendTxWithHash(
    tx: Transaction,
  ): Promise<{ txHash: string; response: SorobanRpc.Api.GetTransactionResponse }> {
    const sendResponse = await this.server.sendTransaction(tx);
    if (sendResponse.status === 'ERROR') {
      throw new Error(`Transaction failed: ${JSON.stringify(sendResponse)}`);
    }

    const txHash = sendResponse.hash;
    let statusResponse = await this.server.getTransaction(txHash);
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      if (statusResponse.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        return { txHash, response: statusResponse };
      }

      if (statusResponse.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Transaction failed: ${statusResponse.resultMetaXdr}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
      statusResponse = await this.server.getTransaction(txHash);
      attempts++;
    }

    throw new Error(`Transaction polling timed out for ${txHash}`);
  }

  async getLedgerEntries(
    ...keys: xdr.LedgerKey[]
  ): Promise<SorobanRpc.Api.GetLedgerEntriesResponse> {
    return this.server.getLedgerEntries(...keys);
  }
}
