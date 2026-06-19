import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { SensorsModule } from './modules/sensors/sensors.module';
import { CreditsModule } from './modules/credits/credits.module';
import { OracleModule } from './modules/oracle/oracle.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StellarModule } from './modules/stellar/stellar.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import stellarConfig from './config/stellar.config';
import jwtConfig from './config/jwt.config';
import queueConfig from './config/queue.config';
import oracleConfig from './config/oracle.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, stellarConfig, jwtConfig, queueConfig, oracleConfig],
    }),
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.database'),
        autoLoadEntities: true,
        synchronize: configService.get('app.nodeEnv') !== 'production',
      }),
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('queue.redisHost'),
          port: configService.get('queue.redisPort'),
          password: configService.get('queue.redisPassword') || undefined,
        },
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    ProjectsModule,
    SensorsModule,
    CreditsModule,
    OracleModule,
    GovernanceModule,
    AnalyticsModule,
    NotificationsModule,
    StellarModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
