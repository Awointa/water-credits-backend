import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { HealthService, HealthReport } from './health.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Full health report — returns 200 when ok/degraded, 503 when down.
   * Used by load balancers and monitoring systems.
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'Full health report for load balancers and monitoring' })
  async check(@Res() res: Response): Promise<void> {
    const report: HealthReport = await this.healthService.getHealth();
    const httpStatus = report.status === 'down' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK;
    res.status(httpStatus).json(report);
  }

  /**
   * Lightweight liveness probe — always returns 200 if the process is up.
   * Use this for Kubernetes livenessProbe.
   */
  @Get('live')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kubernetes liveness probe' })
  live(): { status: string } {
    return { status: 'alive' };
  }

  /**
   * Readiness probe — returns 200 only when DB is reachable.
   * Use this for Kubernetes readinessProbe.
   */
  @Get('ready')
  @Public()
  @ApiOperation({ summary: 'Kubernetes readiness probe' })
  async ready(@Res() res: Response): Promise<void> {
    const report = await this.healthService.getHealth();
    const dbDown = report.checks.database.status === 'down';
    res
      .status(dbDown ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK)
      .json({ status: dbDown ? 'not ready' : 'ready' });
  }
}
