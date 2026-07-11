import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { SensorDevice } from '../../modules/sensors/entities/sensor-device.entity';
import { API_KEY_AUTH } from '../decorators/api-key-auth.decorator';

/**
 * Guard that validates sensor devices via an X-API-Key header.
 *
 * Keys are stored as bcrypt hashes on the SensorDevice entity so that
 * a database leak does not expose raw keys.  The guard attaches the
 * resolved SensorDevice to request.sensorDevice for downstream use.
 *
 * Apply the guard locally (not globally) on sensor ingestion routes:
 *
 *   @UseGuards(ApiKeyGuard)
 *   @ApiKeyAuth()
 *   @Post('readings')
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(SensorDevice)
    private readonly deviceRepo: Repository<SensorDevice>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only enforce on routes decorated with @ApiKeyAuth()
    const requiresApiKey = this.reflector.getAllAndOverride<boolean>(API_KEY_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiresApiKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { sensorDevice?: SensorDevice }>();
    const rawKey: string | undefined = (request.headers as any)['x-api-key'];

    if (!rawKey) {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    // API key format: wc_<deviceId>_<secret>
    const parts = rawKey.split('_');
    if (parts.length < 3 || parts[0] !== 'wc') {
      throw new UnauthorizedException('Malformed API key');
    }

    // deviceId is everything between the first and last underscore segments
    const deviceId = parts.slice(1, -1).join('_');
    const secret = parts[parts.length - 1];

    const device = await this.deviceRepo.findOne({ where: { deviceId } });
    if (!device) {
      this.logger.warn(`API key auth failed: device '${deviceId}' not found`);
      throw new UnauthorizedException('Invalid API key');
    }

    const apiKeyHash: string | null = (device as any).apiKeyHash ?? null;
    if (!apiKeyHash) {
      this.logger.warn(`Device '${deviceId}' has no API key configured`);
      throw new UnauthorizedException('Device has no API key configured');
    }

    const valid = await bcrypt.compare(secret, apiKeyHash);
    if (!valid) {
      this.logger.warn(`API key auth failed for device '${deviceId}': invalid secret`);
      throw new UnauthorizedException('Invalid API key');
    }

    // Attach device to request for downstream handlers
    request.sensorDevice = device;
    return true;
  }
}
