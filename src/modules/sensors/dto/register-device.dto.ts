import { IsString, IsOptional, IsObject, IsUUID, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsUUID()
  projectId: string;

  @IsString()
  @MaxLength(100)
  deviceId: string;

  @IsString()
  @MaxLength(100)
  manufacturer: string;

  @IsString()
  @MaxLength(100)
  model: string;

  @IsString()
  publicKey: string;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;
}
