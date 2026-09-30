import { ApiProperty } from '@nestjs/swagger';
import {
  type EsqueciSenhaRequest,
  type ReenviarVerificacaoRequest,
  type ReenviarVerificacaoResponse,
  type RedefinirSenhaRequest,
  type RegistroResponse,
  type VerificarEmailRequest,
  type VerificarEmailResponse,
} from '@checkpoint/shared';
import { RawValue } from '../../../common/dto/transforms';
import { emailProblem, NormalizedEmail, novaSenhaProblem, Rule, tokenProblem } from './field-rules';

const TOKEN_DOC = {
  example: 'a1'.repeat(32),
  description: '64 caracteres hexadecimais minúsculos (o que vem no link do e-mail).',
};

export class VerificarEmailDto implements VerificarEmailRequest {
  @ApiProperty(TOKEN_DOC)
  @RawValue()
  @Rule(tokenProblem)
  token!: string;
}

export class ReenviarVerificacaoDto implements ReenviarVerificacaoRequest {
  @ApiProperty({ example: 'ana@exemplo.com' })
  @NormalizedEmail()
  @Rule(emailProblem)
  email!: string;
}

export class EsqueciSenhaDto implements EsqueciSenhaRequest {
  @ApiProperty({ example: 'ana@exemplo.com' })
  @NormalizedEmail()
  @Rule(emailProblem)
  email!: string;
}

export class RedefinirSenhaDto implements RedefinirSenhaRequest {
  @ApiProperty(TOKEN_DOC)
  @RawValue()
  @Rule(tokenProblem)
  token!: string;

  @ApiProperty({
    example: 'outra-senha-boa',
    description:
      'Mesma regra do registro: de 8 caracteres a 72 bytes em UTF-8; não pode ser só espaços.',
  })
  @RawValue()
  @Rule(novaSenhaProblem)
  novaSenha!: string;
}

/** Só existem para o Swagger mostrar o formato (o contrato real está no shared). */
export class RegistroResponseDto implements RegistroResponse {
  @ApiProperty({ example: 'ana@exemplo.com' })
  email!: string;

  @ApiProperty({
    description: 'false = a conta foi criada, mas o e-mail de verificação pode não ter chegado.',
  })
  emailEnviado!: boolean;
}

export class VerificarEmailResponseDto implements VerificarEmailResponse {
  @ApiProperty({ description: 'true = o e-mail já estava verificado (o link foi aberto de novo).' })
  jaEstavaVerificado!: boolean;
}

export class ReenviarVerificacaoResponseDto implements ReenviarVerificacaoResponse {
  @ApiProperty({ enum: ['enviado', 'ja-verificado'] })
  estado!: 'enviado' | 'ja-verificado';
}

export class MensagemResponseDto {
  @ApiProperty({ example: 'Se esse e-mail existir, você vai receber um link.' })
  mensagem!: string;
}
