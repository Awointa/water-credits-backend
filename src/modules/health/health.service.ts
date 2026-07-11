import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { StellarClient } from '../stellar/stellar.client';

export interface ComponentHealth {
  status: 'ok' | 'degraded' | 'down';
  latency_ms?: number;
  detail?: string;
}

export interface QueueHealth {
  status: 'ok' | 'degraded' | 'down';
  waiting: number;
  active: number;
  failed: number;
}

export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  uptime_s: number;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    stellar: ComponentHealth;
    queues: Record<string, QueueHealth>;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectQueue('sensor-ingestion')
    private readonly sensorQueue: Queue,
    @InjectQueue('oracle-submit')
    private readonly oracleQueue: Queue,
    @InjectQueue('retirements')
    private readonly retirementQueue: Queue,
    private readonly stellarClient: StellarClient,
  ) {}

  async getHealth(): Promise<HealthReport> {
    const [database, redis, stellar, queues] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStellar(),
      this.checkQueues(),
    ]);

    const componentStatuses = [database.status, redis.status, stellar.status];
    const queueStatuses = Object.values(queues).map((q) => q.status);
    const allStatuses = [...componentStatuses, ...queueStatuses];

    let overallStatus: 'ok' | 'degraded' | 'down' = 'ok';
    if (allStatuses.some((s) => s === 'down')) {
      overallStatus = 'down';
    } else if (allStatuses.some((s) => s === 'degraded')) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime_s: Math.floor((Date.now() - this.startTime) / 1000),
      checks: { database, redis, stellar, queues },
    };
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', latency_ms: Date.now() - start };
    } catch (err) {
      this.logger.warn(`Database health check failed: ${(err as Error).message}`);
      return { status: 'down', detail: (err as Error).message };
    }
  }

  private async checkRedis(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      // Bull queues use ioredis under the hood; a simple isReady check suffices
      const client = await this.sensorQueue.client;
      await (client as any).ping();
      return { status: 'ok', latency_ms: Date.now() - start };
    } catch (err) {
      this.logger.warn(`Redis health check failed: ${(err as Error).message}`);
      return { status: 'down', detail: (err as Error).message };
    }
  }

  private async checkStellar(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const server = this.stellarClient.getServer();
      const ledger = await server.getLatestLedger();
      return {
        status: 'ok',
        latency_ms: Date.now() - start,
        detail: `latest_ledger=${ledger.sequence}`,
      };
    } catch (err) {
      this.logger.warn(`Stellar RPC health check failed: ${(err as Error).message}`);
      return { status: 'degraded', detail: (err as Error).message };
    }
  }

  private async checkQueues(): Promise<Record<string, QueueHealth>> {
    const queues: Array<{ name: string; queue: Queue }> = [
      { name: 'sensor-ingestion', queue: this.sensorQueue },
      { name: 'oracle-submit', queue: this.oracleQueue },
      { name: 'retirements', queue: this.retirementQueue },
    ];

    const results: Record<string, QueueHealth> = {};

    for (const { name, queue } of queues) {
      try {
        const [waiting, active, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getFailedCount(),
        ]);

        const status: 'ok' | 'degraded' = failed > 10 ? 'degraded' : 'ok';
        results[name] = { status, waiting, active, failed };
      } catch (err) {
        results[name] = { status: 'down', waiting: -1, active: -1, failed: -1 };
      }
    }

    return results;
  }
}
