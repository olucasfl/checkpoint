import { BadRequestException } from '@nestjs/common';
import { type ApiErrorResponse } from '@checkpoint/shared';
import { createValidationPipe } from '../../../common/pipes/app-validation.pipe';
import { CreateGameDto } from './create-game.dto';

// Mesmas opcoes do ValidationPipe global do main.ts.
const pipe = createValidationPipe();

function parse(body: unknown): Promise<CreateGameDto> {
  return pipe.transform(body, { type: 'body', metatype: CreateGameDto });
}

async function rejection(body: unknown): Promise<ApiErrorResponse> {
  try {
    await parse(body);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as ApiErrorResponse;
  }
  throw new Error('esperava que a validacao rejeitasse o body');
}

const valid = { titulo: 'Hollow Knight', status: 'JOGANDO' };

describe('CreateGameDto', () => {
  it('aceita so titulo e status (CA-01)', async () => {
    const dto = await parse(valid);

    expect(dto).toMatchObject(valid);
  });

  it('aceita plataforma e notas por critério (CA-01)', async () => {
    const dto = await parse({
      titulo: 'Celeste',
      status: 'ZERADO',
      plataforma: 'PC',
      gameplay: 9,
      historia: 8.5,
    });

    expect(dto).toMatchObject({ plataforma: 'PC', gameplay: 9, historia: 8.5 });
  });

  it('apara espacos nas pontas do titulo e da plataforma (CA-03)', async () => {
    const dto = await parse({ ...valid, titulo: '  Outer Wilds  ', plataforma: '  PC ' });

    expect(dto.titulo).toBe('Outer Wilds');
    expect(dto.plataforma).toBe('PC');
  });

  it('deixa plataforma so com espacos virar "" (o service a trata como sem plataforma) (CA-04)', async () => {
    const dto = await parse({ ...valid, plataforma: '   ' });

    expect(dto.plataforma).toBe('');
  });

  it('aceita null em plataforma, nas notas e na descricao', async () => {
    const dto = await parse({
      ...valid,
      plataforma: null,
      gameplay: null,
      trilhaSonora: null,
      descricao: null,
    });

    expect(dto.plataforma).toBeNull();
    expect(dto.gameplay).toBeNull();
    expect(dto.trilhaSonora).toBeNull();
    expect(dto.descricao).toBeNull();
  });

  it.each([
    ['sem titulo', { status: 'JOGANDO' }],
    ['titulo vazio', { ...valid, titulo: '' }],
    ['titulo so com espacos', { ...valid, titulo: '   ' }],
    ['titulo com 121 caracteres', { ...valid, titulo: 'a'.repeat(121) }],
    ['titulo que nao e texto (lista)', { ...valid, titulo: ['Hades'] }],
    ['titulo que nao e texto (numero)', { ...valid, titulo: 123 }],
  ])('rejeita %s com fields.titulo (CA-13, CA-14)', async (_nome, body) => {
    const error = await rejection(body);

    expect(error.statusCode).toBe(400);
    expect(error.fields?.titulo).toEqual(expect.any(String));
  });

  it('aceita titulo com exatamente 120 caracteres', async () => {
    await expect(parse({ ...valid, titulo: 'a'.repeat(120) })).resolves.toBeDefined();
  });

  it.each([
    ['sem status', { titulo: 'Hades' }],
    ['status inexistente', { titulo: 'Hades', status: 'PAUSADO' }],
    ['status em minusculas', { titulo: 'Hades', status: 'jogando' }],
    ['status como lista', { titulo: 'Hades', status: ['JOGANDO'] }],
    ['status null', { titulo: 'Hades', status: null }],
  ])('rejeita %s com fields.status (CA-15)', async (_nome, body) => {
    const error = await rejection(body);

    expect(error.fields?.status).toEqual(expect.any(String));
  });

  it.each([
    ['11', 11],
    ['10,1', 10.1],
    ['9,99999999999 (quase 10)', 9.99999999999],
    ['-1', -1],
    ['-0,1', -0.1],
    ['7,55 (2 casas)', 7.55],
    ['0,01', 0.01],
    ['texto numerico "7"', '7'],
    ['texto com virgula "7,3"', '7,3'],
    ['booleano', true],
    ['objeto', { valor: 7 }],
  ])('rejeita nota %s com fields.gameplay (CA-04)', async (_nome, gameplay) => {
    const error = await rejection({ ...valid, gameplay });

    expect(error.fields?.gameplay).toBe(
      'A nota de Gameplay deve ser um número de 0 a 10, com no máximo 1 casa decimal',
    );
  });

  it.each(['gameplay', 'historia', 'graficos', 'trilhaSonora', 'performance'] as const)(
    'valida o criterio %s com a mensagem do proprio rotulo',
    async (chave) => {
      const error = await rejection({ ...valid, [chave]: 11 });

      expect(Object.keys(error.fields ?? {})).toEqual([chave]);
    },
  );

  it('aceita os limites (0 e 10) e uma casa decimal (7,3), sem erro de ponto flutuante', async () => {
    await expect(parse({ ...valid, gameplay: 0 })).resolves.toMatchObject({ gameplay: 0 });
    await expect(parse({ ...valid, gameplay: 10 })).resolves.toMatchObject({ gameplay: 10 });
    await expect(parse({ ...valid, historia: 7.3 })).resolves.toMatchObject({ historia: 7.3 });
    await expect(parse({ ...valid, graficos: 0.1 })).resolves.toMatchObject({ graficos: 0.1 });
    await expect(parse({ ...valid, performance: 9.9 })).resolves.toMatchObject({
      performance: 9.9,
    });
  });

  it('descricao: apara as pontas, preserva as quebras e normaliza CRLF (CA-11)', async () => {
    const dto = await parse({ ...valid, descricao: '  Ótimo\r\n\r\njogo\n  ' });

    expect(dto.descricao).toBe('Ótimo\n\njogo');
  });

  it('descricao: 1000 caracteres passa e 1001 nao (CA-11)', async () => {
    await expect(parse({ ...valid, descricao: 'a'.repeat(1000) })).resolves.toBeDefined();

    const error = await rejection({ ...valid, descricao: 'a'.repeat(1001) });
    expect(error.fields?.descricao).toBe('A descrição deve ter no máximo 1000 caracteres');
  });

  it('descricao que nao e texto falha', async () => {
    const error = await rejection({ ...valid, descricao: 42 });

    expect(error.fields?.descricao).toEqual(expect.any(String));
  });

  it('rejeita o campo antigo nota e o cita na message (CA-12)', async () => {
    const error = await rejection({ ...valid, nota: 8 });

    expect(error.message).toContain('nota');
  });

  it('rejeita plataforma com 61 caracteres com fields.plataforma (CA-17)', async () => {
    const error = await rejection({ ...valid, plataforma: 'p'.repeat(61) });

    expect(error.fields?.plataforma).toEqual(expect.any(String));
  });

  it('rejeita campo nao declarado e o cita na message (CA-18)', async () => {
    const error = await rejection({ ...valid, cor: 'azul' });

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('cor');
  });

  it('rejeita capaUrl e capaPath no body: a capa nao passa pelo JSON do jogo', async () => {
    const error = await rejection({ ...valid, capaUrl: 'http://x', capaPath: 'a/b.png' });

    expect(error.message).toContain('capaUrl');
    expect(error.message).toContain('capaPath');
  });

  it('acumula erros de mais de um campo', async () => {
    const error = await rejection({ titulo: '', status: 'PAUSADO', gameplay: 99 });

    expect(Object.keys(error.fields ?? {}).sort()).toEqual(['gameplay', 'status', 'titulo']);
  });
});
