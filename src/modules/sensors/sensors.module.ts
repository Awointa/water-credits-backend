import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SensorsController } from './sensors.controller';
import { SensorsService } from './sensors.service';
import { SensorDevice } from './entities/sensor-device.entity';
import { SensorReading } from './entities/sensor-reading.entity';
import { ReadingBatch } from './entities/reading-batch.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SensorDevice, SensorReading, ReadingBatch])],
  controllers: [SensorsController],
  providers: [SensorsService],
  exports: [SensorsService, TypeOrmModule],
})
export class SensorsModule {}
