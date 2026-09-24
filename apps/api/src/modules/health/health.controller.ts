import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type HealthCheckResponse } from '@checkpoint/shared';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

// Aberto de propósito: monitoramento e a sonda de conectividade do web não têm sessão.
@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifica se a API esta no ar e conectada ao banco' })
  check(): Promise<HealthCheckResponse> {
    return this.healthService.check();
  }
}
