import { ConfigService } from '@nestjs/config';
import { Account, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { StellarClient } from './stellar.client';

describe('StellarClient simulation account', () => {
  const simulationSecret = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).secret();

  function createClient(simulationSecretValue = ''): StellarClient {
    const values: Record<string, string> = {
      'stellar.rpcUrl': 'https://soroban-testnet.stellar.org',
      'stellar.backendSecret': '',
      'stellar.simulationSecret': simulationSecretValue,
    };
    const configService = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    return new StellarClient(configService);
  }

  function buildTransaction(source: string) {
    return new TransactionBuilder(new Account(source, '0'), {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.manageData({ name: 'simulation-test', value: '1' }))
      .setTimeout(0)
      .build();
  }

  it('reuses one cached simulation keypair', () => {
    const client = createClient();

    expect(client.getSimulationKeypair()).toBe(client.getSimulationKeypair());
    expect(client.getSimulationKeypair().publicKey()).toBe(
      Keypair.fromRawEd25519Seed(Buffer.alloc(32)).publicKey(),
    );
  });

  it('accepts an injectable simulation secret', () => {
    const client = createClient(simulationSecret);

    expect(client.getSimulationKeypair().secret()).toBe(simulationSecret);
  });

  it('blocks simulation transactions in sendTx before contacting the RPC server', async () => {
    const client = createClient();
    const transaction = buildTransaction(client.getSimulationKeypair().publicKey());
    const sendTransaction = jest.spyOn(client.getServer(), 'sendTransaction');

    await expect(client.sendTx(transaction)).rejects.toThrow(
      'Simulation transactions must not be submitted',
    );
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it('blocks simulation transactions in sendTxWithHash before contacting the RPC server', async () => {
    const client = createClient();
    const transaction = buildTransaction(client.getSimulationKeypair().publicKey());
    const sendTransaction = jest.spyOn(client.getServer(), 'sendTransaction');

    await expect(client.sendTxWithHash(transaction)).rejects.toThrow(
      'Simulation transactions must not be submitted',
    );
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
