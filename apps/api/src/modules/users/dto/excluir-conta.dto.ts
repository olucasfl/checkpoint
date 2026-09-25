import { ApiProperty } from '@nestjs/swagger';
import { type ExcluirContaRequest } from '@checkpoint/shared';
import { RawValue } from '../../../common/dto/transforms';
import { Rule, senhaLoginProblem } from '../../auth/dto/field-rules';

/**
 * Corpo de `POST /api/users/me/exclusao`. A senha segue a regra do LOGIN (não vazia, até 72 bytes),
 * não a de senha nova: quem tem uma senha antiga curta também precisa conseguir excluir a conta.
 */
export class ExcluirContaDto implements ExcluirContaRequest {
  @ApiProperty({
    example: 'segredo-forte',
    description: 'A senha atual. Texto não vazio, até 72 bytes.',
  })
  @RawValue()
  @Rule(senhaLoginProblem)
  senha!: string;
}
