import { BadRequestException } from '@nestjs/common';
import { type ApiErrorResponse } from '@checkpoint/shared';
import { createValidationPipe } from '../../../common/pipes/app-validation.pipe';
import { FIELD_MESSAGES } from '../../auth/dto/field-rules';
import { ExcluirContaDto } from './excluir-conta.dto';

// Mesmas opções do ValidationPipe global do main.ts.
const pipe = createValidationPipe();

function parse(body: unknown): Promise<ExcluirContaDto> {
  return pipe.transform(body, {
    type: 'body',
    metatype: ExcluirContaDto,
  }) as Promise<ExcluirContaDto>;
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

describe('ExcluirContaDto (perfil CA-25)', () => {
  it('aceita a senha sem aparar (espaços fazem parte dela)', async () => {
    await expect(parse({ senha: ' segredo-forte ' })).resolves.toEqual({
      senha: ' segredo-forte ',
    });
  });

  it('uma senha antiga curta também serve (a regra é a do login, não a de senha nova)', async () => {
    await expect(parse({ senha: 'curta' })).resolves.toEqual({ senha: 'curta' });
  });

  it.each([
    ['vazia', { senha: '' }],
    ['ausente', {}],
    ['de outro tipo', { senha: 12345678 }],
  ])('senha %s → 400 VALIDACAO com fields.senha', async (_nome, body) => {
    await expect(rejection(body)).resolves.toMatchObject({
      statusCode: 400,
      code: 'VALIDACAO',
      fields: { senha: FIELD_MESSAGES.senhaLoginVazia },
    });
  });

  it('acima de 72 bytes → 400 com fields.senha', async () => {
    await expect(rejection({ senha: 'á'.repeat(37) })).resolves.toMatchObject({
      fields: { senha: FIELD_MESSAGES.senhaLonga },
    });
  });

  it('campo desconhecido → 400', async () => {
    await expect(rejection({ senha: 'segredo-forte', userId: 'outro' })).resolves.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('userId'),
    });
  });
});
