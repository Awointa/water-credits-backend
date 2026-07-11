import {
  IsString,
  IsOptional,
  IsObject,
  IsUUID,
  MaxLength,
  MinLength,
  Matches,
  IsArray,
  IsEnum,
  IsLatitude,
  IsLongitude,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Measurable parameters a sensor device can report.
 * Mirrors the physical parameter set validated by SensorsService.
 */
export enum SensorParameter {
  PH = 'ph',
  TURBIDITY = 'turbidity',
  DISSOLVED_OXYGEN = 'dissolvedOxygen',
  FLOW_RATE = 'flowRate',
  NITROGEN = 'nitrogen',
  PHOSPHORUS = 'phosphorus',
  TEMPERATURE = 'temperature',
}

/**
 * Optional GPS coordinates for a device's physical installation site.
 */
export class DeviceLocationDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lon: number;

  /** Elevation in metres above sea level (optional) */
  @IsOptional()
  @Type(() => Number)
  elevationM?: number;
}

/**
 * Payload for POST /sensors/devices — registers a new sensor device.
 *
 * Validation rules:
 *  - deviceId: slug-safe alphanumerics, hyphens, and underscores only
 *              so it can be embedded in API key format wc_<deviceId>_<secret>
 *  - publicKey: must be a 56-character Stellar G... address (ECDSA key
 *               used to verify signed readings)
 *  - parameters: restricted to the known SensorParameter enum values
 *  - location:   validated lat/lon if provided
 */
export class RegisterDeviceDto {
  /** UUID of the project this device belongs to */
  @IsUUID()
  projectId: string;

  /**
   * Human-readable device identifier (e.g. "sensor-gv-001").
   * Allowed characters: a-z, A-Z, 0-9, hyphen, underscore.
   * Length: 3–100 characters.
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'deviceId may only contain letters, numbers, hyphens, and underscores',
  })
  deviceId: string;

  /** Device manufacturer name */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  manufacturer: string;

  /** Device model name */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model: string;

  /**
   * Stellar G... public key (56 characters) used to verify ECDSA
   * signatures on submitted sensor readings.
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(56)
  @MaxLength(56)
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'publicKey must be a valid Stellar public key (starts with G, 56 characters)',
  })
  publicKey: string;

  /**
   * List of parameter types this device reports.
   * At least one parameter must be provided.
   */
  @IsArray()
  @IsEnum(SensorParameter, { each: true })
  parameters: SensorParameter[];

  /** Physical installation location of the device (optional) */
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceLocationDto)
  location?: DeviceLocationDto;

  /**
   * Free-form metadata blob (serial number, firmware version, etc.).
   * Keep flat and serialisable; max 4 KB once JSON-stringified.
   */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
