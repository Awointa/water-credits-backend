import { IsString, IsOptional, IsNumber, Min, Max, IsDateString, MaxLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsString()
  @MaxLength(100)
  methodology: string;

  @IsNumber()
  @Min(0)
  areaHectares: number;

  @IsOptional()
  @IsDateString()
  baselineStartDate?: string;

  @IsOptional()
  @IsDateString()
  baselineEndDate?: string;
}
