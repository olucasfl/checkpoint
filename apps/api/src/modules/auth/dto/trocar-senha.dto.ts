import { ApiProperty } from '@nestjs/swagger';
import { type TrocarSenhaRequest } from '@checkpoint/shared';
import { RawValue } from '../../../common/dto/transforms';
import { novaSenhaProblem, Rule, senhaAtualProblem } from './field-rules';

export class TrocarSenhaDto implements TrocarSenhaRequest {
  @ApiProperty({ example: 'segredo-forte', description: 'Texto não vazio, até 72 bytes.' })
  @RawValue()
  @Rule(senhaAtualProblem)
  senhaAtual!: string;

  @ApiProperty({
    example: 'outra-senha-boa',
    description:
      'Mesma regra do registro: de 8 caracteres a 72 bytes em UTF-8; espaços contam; não pode ser só espaços.',
  })
  @RawValue()
  @Rule(novaSenhaProblem)
  novaSenha!: string;
}
