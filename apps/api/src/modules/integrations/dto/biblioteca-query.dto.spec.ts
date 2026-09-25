import { BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../../../common/pipes/app-validation.pipe';
import { BibliotecaQueryDto } from './biblioteca-query.dto';

const pipe = createValidationPipe();

function parse(query: unknown): Promise<BibliotecaQueryDto> {
  return pipe.transform(query, { type: 'query', metatype: BibliotecaQueryDto });
}

/** `fields` como registro genérico: `busca` e `limite` não são campos de formulário (não estão em `ApiErrorField`). */
async function camposDoErro(query: unknown): Promise<Record<string, string> | undefined> {
  const promise = parse(query);
  await expect(promise).rejects.toBeInstanceOf(BadRequestException);
  const error = (await promise.catch((e: unknown) => e)) as BadRequestException;
  expect(error.getResponse()).toMatchObject({ statusCode: 400, code: 'VALIDACAO' });
  return (error.getResponse() as { fields?: Record<string, string> }).fields;
}

describe('BibliotecaQueryDto (CA-23)', () => {
  it('aceita a query vazia', async () => {
    await expect(parse({})).resolves.toBeDefined();
  });

  it('aceita busca e limite; o limite chega como número e a busca é aparada', async () => {
    await expect(parse({ busca: '  Celeste ', limite: '2' })).resolves.toMatchObject({
      busca: 'Celeste',
      limite: 2,
    });
  });

  it.each(['1', '30', '50'])('aceita limite=%s (nos limites)', async (limite) => {
    await expect(parse({ limite })).resolves.toMatchObject({ limite: Number(limite) });
  });

  it('aceita busca de 100 caracteres e busca vazia', async () => {
    await expect(parse({ busca: 'a'.repeat(100) })).resolves.toBeDefined();
    await expect(parse({ busca: '' })).resolves.toBeDefined();
  });

  it.each([
    ['0', '0'],
    ['51', '51'],
    ['negativo', '-1'],
    ['decimal', '1.5'],
    ['texto', 'abc'],
    ['notação científica', '1e1'],
    ['vazio', ''],
    ['com espaço', ' 5'],
    ['repetido na query', ['1', '2']],
    ['um objeto', { a: '1' }],
    ['número enorme', '9999999'],
  ])('rejeita limite %s com fields.limite', async (_nome, limite) => {
    expect((await camposDoErro({ limite }))?.limite).toEqual(expect.any(String));
  });

  it.each([
    ['101 caracteres', 'a'.repeat(101)],
    ['repetida na query', ['a', 'b']],
    ['um objeto', { a: 'b' }],
    ['um número', 5],
  ])('rejeita busca %s com fields.busca', async (_nome, busca) => {
    expect((await camposDoErro({ busca }))?.busca).toEqual(expect.any(String));
  });

  it('um campo desconhecido é 400 (o pipe global recusa o que o DTO não declara)', async () => {
    await expect(parse({ userId: 'outro' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
