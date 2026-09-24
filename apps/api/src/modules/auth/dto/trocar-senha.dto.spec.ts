import { BadRequestException } from '@nestjs/common';
import { type ApiErrorResponse } from '@checkpoint/shared';
import { createValidationPipe } from '../../../common/pipes/app-validation.pipe';
import { FIELD_MESSAGES } from './field-rules';
import { TrocarSenhaDto } from './trocar-senha.dto';

// Mesmas opções do ValidationPipe global do main.ts.
const pipe = createValidationPipe();

function parse(body: unknown): Promise<TrocarSenhaDto> {
  return pipe.transform(body, {
    type: 'body',
    metatype: TrocarSenhaDto,
  }) as Promise<TrocarSenhaDto>;
}

async function rejection(body: unknown): Promise<ApiErrorResponse> {
  try {
    await parse(body);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as ApiErrorResponse;
  }
  throw new Error('esperava que a validação rejeitasse o body');
}

const valid = { senhaAtual: 'segredo-forte', novaSenha: 'outra-senha-boa' };

describe('TrocarSenhaDto (CA-54)', () => {
  it('aceita um corpo válido, sem aparar nenhuma das senhas', async () => {
    await expect(
      parse({ senhaAtual: ' velha ', novaSenha: ' nova-com-espacos ' }),
    ).resolves.toEqual({ senhaAtual: ' velha ', novaSenha: ' nova-com-espacos ' });
  });

  it.each([
    ['7 caracteres', '1234567', FIELD_MESSAGES.senhaCurta],
    ['73 bytes (36 "á" + 1)', `${'á'.repeat(36)}x`, FIELD_MESSAGES.senhaLonga],
    ['só espaços', '        ', FIELD_MESSAGES.senhaSoEspacos],
    ['vazia', '', FIELD_MESSAGES.senhaCurta],
  ])('novaSenha com %s → 400 VALIDACAO em fields.novaSenha', async (_nome, novaSenha, message) => {
    const erro = await rejection({ ...valid, novaSenha });

    expect(erro).toMatchObject({
      statusCode: 400,
      code: 'VALIDACAO',
      fields: { novaSenha: message },
    });
  });

  it('novaSenha de 72 bytes (36 "á") é aceita', async () => {
    await expect(parse({ ...valid, novaSenha: 'á'.repeat(36) })).resolves.toBeDefined();
  });

  it.each([
    ['vazia', '', FIELD_MESSAGES.senhaAtualVazia],
    ['ausente', undefined, FIELD_MESSAGES.senhaAtualVazia],
    ['acima de 72 bytes', 'á'.repeat(37), FIELD_MESSAGES.senhaLonga],
  ])('senhaAtual %s → 400 em fields.senhaAtual', async (_nome, senhaAtual, message) => {
    const erro = await rejection({ ...valid, senhaAtual });

    expect(erro).toMatchObject({ code: 'VALIDACAO', fields: { senhaAtual: message } });
  });

  it('a senha atual pode ser curta (uma senha antiga não é barrada antes de conferir)', async () => {
    await expect(parse({ ...valid, senhaAtual: 'curta' })).resolves.toBeDefined();
  });

  it('campo desconhecido → 400', async () => {
    const erro = await rejection({ ...valid, userId: 'outro' });

    expect(erro).toMatchObject({ statusCode: 400, message: expect.stringContaining('userId') });
  });
});
