import { ApiProperty } from '@nestjs/swagger';
import { type LoginRequest } from '@checkpoint/shared';
import { RawValue } from '../../../common/dto/transforms';
import { emailProblem, NormalizedEmail, Rule, senhaLoginProblem } from './field-rules';

export class LoginDto implements LoginRequest {
  @ApiProperty({ example: 'ana@exemplo.com' })
  @NormalizedEmail()
  @Rule(emailProblem)
  email!: string;

  @ApiProperty({
    example: 'segredo-forte',
    description: 'Texto não vazio, até 72 bytes. O tamanho mínimo NÃO vale no login.',
  })
  @RawValue()
  @Rule(senhaLoginProblem)
  senha!: string;
}
