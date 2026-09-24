import { BadRequestException } from '@nestjs/common';
import { type ApiErrorResponse } from '@checkpoint/shared';
import { createValidationPipe } from '../../../common/pipes/app-validation.pipe';
import { FIELD_MESSAGES } from '../../auth/dto/field-rules';
import { AtualizarPerfilDto } from './atualizar-perfil.dto';

// Mesmas opções do ValidationPipe global do main.ts.
const pipe = createValidationPipe();

function parse(body: unknown): Promise<AtualizarPerfilDto> {
  return pipe.transform(body, {
    type: 'body',
    metatype: AtualizarPerfilDto,
  }) as Promise<AtualizarPerfilDto>;
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

describe('AtualizarPerfilDto (perfil CA-02, CA-03)', () => {
  it('apara o nome (CA-02)', async () => {
    await expect(parse({ nome: '  Ana Souza ' })).resolves.toEqual({ nome: 'Ana Souza' });
  });

  it('aceita 60 caracteres (o teto)', async () => {
    await expect(parse({ nome: 'a'.repeat(60) })).resolves.toEqual({ nome: 'a'.repeat(60) });
  });

  it.each([
    ['nome vazio', { nome: '' }, FIELD_MESSAGES.nomeVazio],
    ['nome só de espaços', { nome: '   ' }, FIELD_MESSAGES.nomeVazio],
    ['nome de 61 caracteres', { nome: 'a'.repeat(61) }, FIELD_MESSAGES.nomeLongo],
    ['corpo vazio {}', {}, FIELD_MESSAGES.nomeVazio],
  ])('400 VALIDACAO com fields.nome: %s (CA-03)', async (_caso, body, message) => {
    const error = await rejection(body);

    expect(error).toMatchObject({ statusCode: 400, code: 'VALIDACAO' });
    expect(error.fields).toEqual({ nome: message });
  });

  it('`email` é campo desconhecido: 400 VALIDACAO, e ele aparece na message (CA-03)', async () => {
    const error = await rejection({ email: 'outro@exemplo.com' });

    expect(error).toMatchObject({ statusCode: 400, code: 'VALIDACAO' });
    expect(error.message).toContain('email');
  });

  it('`email` junto de um nome válido também é 400 (não é ignorado em silêncio)', async () => {
    const error = await rejection({ nome: 'Ana', email: 'outro@exemplo.com' });

    expect(error).toMatchObject({ statusCode: 400, code: 'VALIDACAO' });
    expect(error.message).toContain('email');
  });

  it.each([[123], [['Ana']], [{ a: 1 }], [null]])(
    'nome que não é texto (%j) é rejeitado, sem conversão implícita',
    async (nome) => {
      const error = await rejection({ nome });

      expect(error.fields).toHaveProperty('nome');
    },
  );
});
