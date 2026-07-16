import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SensorsService } from './sensors.service';
import { CreateReadingDto } from './dto/create-reading.dto';
import { QueryReadingsDto } from './dto/query-readings.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { Public } from '../../common/decorators/public.decorator';
import { SensorReading } from './entities/sensor-reading.entity';
import { SensorDevice } from './entities/sensor-device.entity';
import { PaginatedResponseDto } from '../../common/dto/api-response.dto';
import { ThrottleSensor } from '../../common/decorators/throttle.decorator';

@Controller('sensors')
export class SensorsController {
  constructor(
    private readonly sensorsService: SensorsService,
    private readonly configService: ConfigService,
  ) {}

  @Post('readings')
  @Public()
  @ThrottleSensor()
  @HttpCode(HttpStatus.CREATED)
  async ingestReading(
    @Body() dto: CreateReadingDto,
    @Headers('x-api-key') apiKey?: string,
  ): Promise<SensorReading> {
    const expectedKey = this.configService.get<string>('app.sensorApiKey');
    if (expectedKey && apiKey !== expectedKey) {
      throw new UnauthorizedException('Invalid API key');
    }
    return this.sensorsService.ingestReading(dto);
  }

  @Get('readings')
  async getReadings(
    @Query() query: QueryReadingsDto,
  ): Promise<PaginatedResponseDto<SensorReading>> {
    const { data, total, page, limit } = await this.sensorsService.getReadings(query);
    return PaginatedResponseDto.from(data, total, page, limit);
  }

  @Get('readings/latest')
  async getLatestReading(
    @Query('deviceId') deviceId?: string,
  ): Promise<SensorReading | SensorReading[]> {
    return this.sensorsService.getLatestReading(deviceId);
  }

  @Get('readings/summary')
  async getAggregatedSummary(
    @Query('projectId') projectId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<Record<string, number | null>> {
    return this.sensorsService.getAggregatedSummary(projectId, startDate, endDate);
  }

  @Post('devices')
  @HttpCode(HttpStatus.CREATED)
  async registerDevice(
    @Body() dto: RegisterDeviceDto,
  ): Promise<SensorDevice & { apiKeyPlaintext: string }> {
    return this.sensorsService.registerDevice(dto.projectId, dto);
  }

  @Get('devices')
  async getDevices(@Query('projectId') projectId?: string): Promise<SensorDevice[]> {
    return this.sensorsService.getDevices(projectId);
  }

  @Get('devices/:id')
  async getDeviceById(@Param('id') id: string): Promise<SensorDevice> {
    return this.sensorsService.getDeviceById(id);
  }
}
