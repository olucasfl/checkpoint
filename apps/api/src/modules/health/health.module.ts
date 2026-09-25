import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ProxyDiagController } from './proxy-diag.controller';

@Module({
  // TEMPORÁRIO: `ProxyDiagController` só existe na branch de diagnóstico (medição de saltos de proxy).
  controllers: [HealthController, ProxyDiagController],
  providers: [HealthService],
})
export class HealthModule {}
