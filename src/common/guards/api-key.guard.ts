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
 * A pre-computed bcrypt hash of the string "dummy" used to normalise timing
 * on unknown-device requests and prevent device-ID enumeration via response
 * timing.  bcrypt.compare will run to completion even when no real hash is
 * available, making hit and miss requests take the same amount of time.
 */
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh9y';

/**
 * Guard that validates sensor devices via an X-API-Key header.
 *
 * Keys are stored as bcrypt hashes on the SensorDevice entity so that
 * a database leak does not expose raw keys.  The guard:
 *
 *  1. Parses the key format  wc_<deviceId>_<secret>
 *  2. Looks up the SensorDevice by the deviceId embedded in the key
 *  3. Runs bcrypt.compare against the stored hash (or a dummy hash on miss
 *     to prevent timing-based device enumeration)
 *  4. Verifies the deviceId extracted from the key matches the deviceId in
 *     the request body — a valid key for device A cannot authenticate
 *     readings submitted with deviceId: B
 *  5. Attaches the resolved SensorDevice to request.sensorDevice for
 *     downstream handlers
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

    const request = context
      .switchToHttp()
      .getRequest<Request & { sensorDevice?: SensorDevice; body?: { deviceId?: string } }>();

    const rawKey = (request.headers as unknown as Record<string, string>)['x-api-key'];

    if (!rawKey) {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    // API key format: wc_<deviceId>_<secret>
    // deviceId may itself contain underscores, so we split on the first and
    // last underscore segments only:
    //   parts[0]              → "wc"  (prefix)
    //   parts.slice(1, -1)    → deviceId segments (rejoined with "_")
    //   parts[parts.length-1] → secret  (last segment)
    const parts = rawKey.split('_');
    if (parts.length < 3 || parts[0] !== 'wc') {
      throw new UnauthorizedException('Malformed API key');
    }

    const deviceIdFromKey = parts.slice(1, -1).join('_');
    const secret = parts[parts.length - 1];

    // Load the device (with apiKeyHash — column has select: false so we
    // must request it explicitly via addSelect using the entity property name).
    const device = await this.deviceRepo
      .createQueryBuilder('d')
      .addSelect('d.apiKeyHash')
      .where('d.deviceId = :deviceId', { deviceId: deviceIdFromKey })
      .getOne();

    if (!device) {
      // Run bcrypt.compare against a dummy hash so the response time is
      // indistinguishable from a valid-device / wrong-secret miss, preventing
      // timing-based device enumeration.
      this.logger.warn(`API key auth failed: device '${deviceIdFromKey}' not found`);
      await bcrypt.compare(secret, DUMMY_HASH);
      throw new UnauthorizedException('Invalid API key');
    }

    const apiKeyHash: string | null = (device as { apiKeyHash?: string }).apiKeyHash ?? null;
    if (!apiKeyHash) {
      this.logger.warn(`Device '${deviceIdFromKey}' has no API key configured`);
      await bcrypt.compare(secret, DUMMY_HASH);
      throw new UnauthorizedException('Device has no API key configured');
    }

    const valid = await bcrypt.compare(secret, apiKeyHash);
    if (!valid) {
      this.logger.warn(`API key auth failed for device '${deviceIdFromKey}': invalid secret`);
      throw new UnauthorizedException('Invalid API key');
    }

    // Bind the key to the reading's deviceId: a valid key for device A must
    // not authenticate a reading submitted with deviceId: B.
    const bodyDeviceId = request.body?.deviceId;
    if (bodyDeviceId !== undefined && bodyDeviceId !== deviceIdFromKey) {
      this.logger.warn(
        `API key auth failed: key belongs to '${deviceIdFromKey}' but reading claims '${bodyDeviceId}'`,
      );
      throw new UnauthorizedException('API key does not match the submitted deviceId');
    }

    // Attach device to request for downstream handlers
    request.sensorDevice = device;
    return true;
  }
}
