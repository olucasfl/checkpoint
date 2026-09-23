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
    await expect(parse({ nota: 5 })).resolves.toMatchObject({ nota: 5 });
    await expect(parse({ titulo: '  Celeste  ' })).resolves.toMatchObject({ titulo: 'Celeste' });
  });

  it('aceita body vazio: quem o rejeita (400) e o service, que conhece o registro (CA-24)', async () => {
    const dto = await parse({});

    expect(Object.values(dto).every((value) => value === undefined)).toBe(true);
  });

  it('aceita null so em plataforma e nota (CA-10, CA-11)', async () => {
    const dto = await parse({ plataforma: null, nota: null });

    expect(dto.plataforma).toBeNull();
    expect(dto.nota).toBeNull();
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
    ['nota 11', { nota: 11 }, 'nota'],
    ['nota fracionada', { nota: 7.5 }, 'nota'],
    ['plataforma com 61 caracteres', { plataforma: 'p'.repeat(61) }, 'plataforma'],
  ])('rejeita %s com fields.%s (CA-25)', async (_nome, body, campo) => {
    const error = await rejection(body);

    expect(error.fields).toHaveProperty(campo);
  });

  it('rejeita campo nao declarado', async () => {
    const error = await rejection({ titulo: 'X', capaUrl: 'http://x' });

    expect(error.message).toContain('capaUrl');
  });
});
