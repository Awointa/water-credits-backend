import { IsString, IsNumber, IsOptional, IsDateString, Min, Max } from 'class-validator';

export class CreateReadingDto {
  @IsString()
  deviceId: string;

  @IsDateString()
  timestamp: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(14)
  ph?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  turbidity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dissolvedOxygen?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  flowRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  nitrogen?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  phosphorus?: number;

  @IsOptional()
  @IsNumber()
  @Min(-50)
  @Max(100)
  temperature?: number;

  @IsString()
  signature: string;
}
