import { Module, Global } from '@nestjs/common';
import { StellarClient } from './stellar.client';
import { StellarService } from './stellar.service';

@Global()
@Module({
  providers: [StellarClient, StellarService],
  exports: [StellarClient, StellarService],
})
export class StellarModule {}
