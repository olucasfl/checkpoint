import { ApiProperty } from '@nestjs/swagger';
import { type RegistroRequest } from '@checkpoint/shared';
import { RawValue, TrimString } from '../../../common/dto/transforms';
import { NormalizedEmail, novaSenhaProblem, nomeProblem, emailProblem, Rule } from './field-rules';

export class RegistroDto implements RegistroRequest {
  @ApiProperty({ example: 'Ana Teste', description: '1 a 60 caracteres; espaços nas pontas saem.' })
  @TrimString()
  @Rule(nomeProblem)
  nome!: string;

  @ApiProperty({
    example: 'ana@exemplo.com',
    description:
      'Normalizado (trim + minúsculas). É só o identificador de login: não é verificado.',
  })
  @NormalizedEmail()
  @Rule(emailProblem)
  email!: string;

  @ApiProperty({
    example: 'segredo-forte',
    description: 'De 8 caracteres a 72 bytes em UTF-8; espaços contam; não pode ser só espaços.',
  })
  @RawValue()
  @Rule(novaSenhaProblem)
  senha!: string;
}
