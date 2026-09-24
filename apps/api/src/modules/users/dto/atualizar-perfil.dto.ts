import { ApiProperty } from '@nestjs/swagger';
import { type AtualizarPerfilRequest } from '@checkpoint/shared';
import { TrimString } from '../../../common/dto/transforms';
import { nomeProblem, Rule } from '../../auth/dto/field-rules';

/**
 * Corpo de `PATCH /api/users/me`. Só o nome, com a mesma regra do registro. Qualquer outro campo,
 * inclusive `email` (não editável: sem envio de e-mail não há como confirmar o endereço novo), é
 * campo desconhecido e o pipe global responde 400.
 */
export class AtualizarPerfilDto implements AtualizarPerfilRequest {
  @ApiProperty({ example: 'Ana Souza', description: '1 a 60 caracteres; espaços nas pontas saem.' })
  @TrimString()
  @Rule(nomeProblem)
  nome!: string;
}
