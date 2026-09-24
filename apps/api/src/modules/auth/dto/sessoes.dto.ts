import { ApiProperty } from '@nestjs/swagger';
import { type EncerrarOutrasSessoesResponse, type SessaoAtiva } from '@checkpoint/shared';

/** Só existe para o Swagger mostrar o formato (o contrato real é o `SessaoAtiva` do shared). */
export class SessaoAtivaDto implements SessaoAtiva {
  @ApiProperty({ example: '3f2b8a52-9c1e-4d6a-8f31-0a7e5b2c9d44' })
  id!: string;

  @ApiProperty({ example: 'Chrome · Android' })
  dispositivo!: string;

  @ApiProperty({ example: '2026-09-24T12:00:00.000Z' })
  criadoEm!: string;

  @ApiProperty({ example: '2026-09-24T14:32:00.000Z' })
  ultimoUsoEm!: string;

  @ApiProperty({ description: 'É a sessão da própria request ("Este aparelho")' })
  atual!: boolean;
}

export class EncerrarOutrasSessoesResponseDto implements EncerrarOutrasSessoesResponse {
  @ApiProperty({
    example: 2,
    description: 'Quantas sessões vivas foram encerradas (0 se não havia)',
  })
  encerradas!: number;
}
