import { BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../../../common/pipes/app-validation.pipe';
import { VincularJogoDto } from './vincular-jogo.dto';

const pipe = createValidationPipe();

function parse(body: unknown): Promise<VincularJogoDto> {
  return pipe.transform(body, { type: 'body', metatype: VincularJogoDto });
}

async function detalhes(
  body: unknown,
): Promise<{ message: string; fields?: Record<string, string> }> {
  const promise = parse(body);
  await expect(promise).rejects.toBeInstanceOf(BadRequestException);
  const error = (await promise.catch((e: unknown) => e)) as BadRequestException;
  expect(error.getResponse()).toMatchObject({ statusCode: 400, code: 'VALIDACAO' });
  return error.getResponse() as { message: string; fields?: Record<string, string> };
}

describe('VincularJogoDto (CA-27)', () => {
  it.each(['504230', '1', '1145360', 'abc', 'A-b_9'])('aceita idExterno %j', async (idExterno) => {
    await expect(parse({ idExterno })).resolves.toMatchObject({ idExterno });
  });

  it('aceita mover true e false', async () => {
    await expect(parse({ idExterno: '1', mover: true })).resolves.toMatchObject({ mover: true });
    await expect(parse({ idExterno: '1', mover: false })).resolves.toMatchObject({ mover: false });
  });

  it.each([
    ['ausente', {}],
    ['vazio', { idExterno: '' }],
    ['com espaço e ponto e vírgula', { idExterno: 'abc; drop' }],
    ['com barra (caminho)', { idExterno: '../1' }],
    ['com aspas', { idExterno: '"1"' }],
    ['41 caracteres', { idExterno: 'a'.repeat(41) }],
    ['um número (não vira texto)', { idExterno: 504230 }],
    ['um array', { idExterno: ['1'] }],
    ['um objeto', { idExterno: { toString: 'x' } }],
    ['null', { idExterno: null }],
  ])('rejeita idExterno %s com fields.idExterno', async (_nome, body) => {
    const erro = await detalhes(body);

    expect(erro.fields?.idExterno).toEqual(expect.any(String));
    expect(erro.message).not.toContain('Campos não permitidos');
  });

  it.each([
    ['texto', 'sim'],
    ['texto "true"', 'true'],
    ['número', 1],
    ['objeto', {}],
  ])('rejeita mover %s (só booleano de verdade) com fields.mover', async (_nome, mover) => {
    const erro = await detalhes({ idExterno: '1', mover });

    expect(erro.fields?.mover).toEqual(expect.any(String));
  });

  it.each([
    ['userId', { idExterno: '1', userId: 'outro' }],
    ['gameId', { idExterno: '1', gameId: 'outro' }],
    [
      'minutosJogados (dado da plataforma não vem do cliente)',
      { idExterno: '1', minutosJogados: 999 },
    ],
    ['plataforma', { idExterno: '1', plataforma: 'PC' }],
  ])('rejeita o campo desconhecido %s (400)', async (_nome, body) => {
    const erro = await detalhes(body);

    expect(erro.message).toContain('Campos não permitidos');
  });

  it('corpo ausente (undefined) é 400', async () => {
    await expect(parse(undefined)).rejects.toBeInstanceOf(BadRequestException);
  });
});
