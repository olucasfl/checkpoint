import { BadRequestException } from '@nestjs/common';
import { type ApiErrorResponse } from '@checkpoint/shared';
import { createValidationPipe } from '../../../common/pipes/app-validation.pipe';
import { UpdateGameDto } from './update-game.dto';

const pipe = createValidationPipe();

function parse(body: unknown): Promise<UpdateGameDto> {
  return pipe.transform(body, { type: 'body', metatype: UpdateGameDto });
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

describe('UpdateGameDto', () => {
  it('aceita qualquer subconjunto dos campos', async () => {
    await expect(parse({ status: 'JOGANDO' })).resolves.toMatchObject({ status: 'JOGANDO' });
    await expect(parse({ gameplay: 5 })).resolves.toMatchObject({ gameplay: 5 });
    await expect(parse({ descricao: ' Texto ' })).resolves.toMatchObject({ descricao: 'Texto' });
    await expect(parse({ titulo: '  Celeste  ' })).resolves.toMatchObject({ titulo: 'Celeste' });
  });

  it('aceita body vazio: quem o rejeita (400) e o service, que conhece o registro (CA-24)', async () => {
    const dto = await parse({});

    expect(Object.values(dto).every((value) => value === undefined)).toBe(true);
  });

  it('aceita null em plataforma, nos cinco criterios e na descricao (CA-10, CA-11)', async () => {
    const dto = await parse({
      plataforma: null,
      gameplay: null,
      historia: null,
      graficos: null,
      trilhaSonora: null,
      performance: null,
      descricao: null,
    });

    expect(dto.plataforma).toBeNull();
    for (const chave of [
      'gameplay',
      'historia',
      'graficos',
      'trilhaSonora',
      'performance',
    ] as const) {
      expect(dto[chave]).toBeNull();
    }
    expect(dto.descricao).toBeNull();
  });

  it('rejeita titulo null com fields.titulo (CA-52)', async () => {
    const error = await rejection({ titulo: null });

    expect(error.fields?.titulo).toEqual(expect.any(String));
  });

  it('rejeita status null com fields.status (CA-52)', async () => {
    const error = await rejection({ status: null });

    expect(error.fields?.status).toEqual(expect.any(String));
  });

  it.each([
    ['titulo vazio', { titulo: '' }, 'titulo'],
    ['titulo so com espacos', { titulo: '   ' }, 'titulo'],
    ['titulo com 121 caracteres', { titulo: 'a'.repeat(121) }, 'titulo'],
    ['status inexistente', { status: 'PAUSADO' }, 'status'],
    ['gameplay 11', { gameplay: 11 }, 'gameplay'],
    ['historia com 2 casas', { historia: 7.55 }, 'historia'],
    ['graficos em texto', { graficos: '8' }, 'graficos'],
    ['descricao com 1001 caracteres', { descricao: 'a'.repeat(1001) }, 'descricao'],
    ['plataforma com 61 caracteres', { plataforma: 'p'.repeat(61) }, 'plataforma'],
  ])('rejeita %s com fields.%s (CA-25)', async (_nome, body, campo) => {
    const error = await rejection(body);

    expect(error.fields).toHaveProperty(campo);
  });

  it('aceita 7,5 (uma casa) e rejeita o campo antigo nota (CA-04, CA-12)', async () => {
    await expect(parse({ gameplay: 7.5 })).resolves.toMatchObject({ gameplay: 7.5 });

    const error = await rejection({ nota: 5 });
    expect(error.message).toContain('nota');
  });

  it('rejeita campo nao declarado', async () => {
    const error = await rejection({ titulo: 'X', capaUrl: 'http://x' });

    expect(error.message).toContain('capaUrl');
  });
});
