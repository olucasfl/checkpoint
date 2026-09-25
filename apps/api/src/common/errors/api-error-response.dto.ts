import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { type ApiErrorField, type ApiErrorResponse } from '@checkpoint/shared';

/** Só existe para o Swagger mostrar o formato dos erros 400/409 (o contrato real é ApiErrorResponse). */
export class ApiErrorResponseDto implements ApiErrorResponse {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({ example: 'Já existe esse jogo nesta plataforma' })
  message!: string;

  @ApiPropertyOptional({
    description:
      'Mensagem por campo (titulo, plataforma, status, os critérios de nota, notas, descricao).',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { titulo: 'Já existe esse jogo nesta plataforma' },
  })
  fields?: Partial<Record<ApiErrorField, string>>;
}
