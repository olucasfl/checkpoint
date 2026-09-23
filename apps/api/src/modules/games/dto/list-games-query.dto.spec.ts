import { BadRequestException } from '@nestjs/common';
import { type ApiErrorResponse } from '@checkpoint/shared';
import { createValidationPipe } from '../../../common/pipes/app-validation.pipe';
import { ListGamesQueryDto } from './list-games-query.dto';

const pipe = createValidationPipe();

function parse(query: unknown): Promise<ListGamesQueryDto> {
  return pipe.transform(query, { type: 'query', metatype: ListGamesQueryDto });
}

describe('ListGamesQueryDto', () => {
  it('aceita a query sem filtro', async () => {
    await expect(parse({})).resolves.toBeDefined();
  });

  it.each(['ZERADO', 'JOGANDO', 'QUERO_JOGAR'])('aceita status=%s (CA-06)', async (status) => {
    await expect(parse({ status })).resolves.toMatchObject({ status });
  });

  it.each([
    ['status inexistente', 'PAUSADO'],
    ['status vazio', ''],
    ['status repetido na query', ['ZERADO', 'JOGANDO']],
  ])('rejeita %s com fields.status (CA-20)', async (_nome, status) => {
    const promise = parse({ status });

    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    const error = (await promise.catch((e: unknown) => e)) as BadRequestException;
    expect((error.getResponse() as ApiErrorResponse).fields?.status).toEqual(expect.any(String));
  });

  it('rejeita parametro de query desconhecido', async () => {
    await expect(parse({ ordem: 'asc' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
