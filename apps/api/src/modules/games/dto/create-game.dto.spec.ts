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

  it('aceita plataforma e nota (CA-02)', async () => {
    const dto = await parse({ titulo: 'Celeste', status: 'ZERADO', plataforma: 'PC', nota: 9 });

    expect(dto).toMatchObject({ plataforma: 'PC', nota: 9 });
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

  it('aceita plataforma null e nota null', async () => {
    const dto = await parse({ ...valid, plataforma: null, nota: null });

    expect(dto.plataforma).toBeNull();
    expect(dto.nota).toBeNull();
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
    ['-1', -1],
    ['7.5', 7.5],
    ['texto numerico "7"', '7'],
    ['booleano', true],
  ])('rejeita nota %s com fields.nota (CA-16)', async (_nome, nota) => {
    const error = await rejection({ ...valid, nota });

    expect(error.fields?.nota).toEqual(expect.any(String));
  });

  it('aceita os limites da nota: 0 e 10', async () => {
    await expect(parse({ ...valid, nota: 0 })).resolves.toMatchObject({ nota: 0 });
    await expect(parse({ ...valid, nota: 10 })).resolves.toMatchObject({ nota: 10 });
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
    const error = await rejection({ titulo: '', status: 'PAUSADO', nota: 99 });

    expect(Object.keys(error.fields ?? {}).sort()).toEqual(['nota', 'status', 'titulo']);
  });
});
