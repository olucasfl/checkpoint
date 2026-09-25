import { AxiosError, type AxiosResponse } from 'axios';
import { type Game } from '@checkpoint/shared';
import { describe, expect, it, vi } from 'vitest';
import { type GamesApi } from '../api/games-api';
import { EMPTY_RATING_TEXTS, type GameFormValues } from './form-values';
import { saveGame } from './save-game';

const values: GameFormValues = {
  titulo: 'Hollow Knight',
  plataforma: 'PC',
  status: 'JOGANDO',
  notas: { ...EMPTY_RATING_TEXTS, gameplay: '8' },
  descricao: '',
};
const file = new File([new Uint8Array([1, 2, 3])], 'capa.png', { type: 'image/png' });

const game = (overrides: Partial<Game> = {}): Game => ({
  id: 'g1',
  titulo: 'Hollow Knight',
  plataforma: 'PC',
  status: 'JOGANDO',
  notas: { gameplay: 8, historia: null, graficos: null, trilhaSonora: null, performance: null },
  notaMedia: 8,
  descricao: null,
  capaUrl: null,
  criadoEm: '2026-09-23T12:00:00.000Z',
  atualizadoEm: '2026-09-23T12:00:00.000Z',
  ...overrides,
});

function httpError(status: number, data: unknown): AxiosError {
  const response = { status, data, statusText: '', headers: {}, config: {} } as AxiosResponse;
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, response);
}

/** A ordem das chamadas é o comportamento: o jogo primeiro, a capa depois. */
function fakeApi(overrides: Partial<Record<keyof GamesApi, ReturnType<typeof vi.fn>>> = {}) {
  const calls: string[] = [];
  const track = (name: string, result: unknown) =>
    vi.fn(async () => {
      calls.push(name);
      return result;
    });
  const api = {
    create: track('create', game()),
    update: track('update', game()),
    uploadCover: track('uploadCover', game({ capaUrl: 'https://s/capas/g1/a.png' })),
    removeCover: track('removeCover', game({ capaUrl: null })),
    ...overrides,
  };
  return { api: api as unknown as GamesApi, mocks: api, calls };
}

describe('saveGame — salva o jogo e DEPOIS a capa', () => {
  it('novo jogo com capa: POST e depois PUT da capa, com o id devolvido (CA-75)', async () => {
    const { api, mocks, calls } = fakeApi();

    const result = await saveGame({ values, cover: { kind: 'upload', file } }, api);

    expect(calls).toEqual(['create', 'uploadCover']);
    expect(mocks.uploadCover).toHaveBeenCalledWith('g1', file);
    expect(result.coverError).toBeNull();
    expect(result.game.capaUrl).toBe('https://s/capas/g1/a.png');
  });

  it('envia o corpo completo do jogo, com cada critério null explícito em "Quero jogar"', async () => {
    const { api, mocks } = fakeApi();

    await saveGame({ values: { ...values, status: 'QUERO_JOGAR' }, cover: { kind: 'keep' } }, api);

    expect(mocks.create).toHaveBeenCalledWith({
      titulo: 'Hollow Knight',
      status: 'QUERO_JOGAR',
      plataforma: 'PC',
      gameplay: null,
      historia: null,
      graficos: null,
      trilhaSonora: null,
      performance: null,
      descricao: null,
    });
  });

  it('sem mudança de capa, não chama a capa', async () => {
    const { api, calls } = fakeApi();

    await saveGame({ values, cover: { kind: 'keep' } }, api);

    expect(calls).toEqual(['create']);
  });

  it('editar um jogo existente usa PATCH, não POST (CA-76)', async () => {
    const { api, calls, mocks } = fakeApi();

    await saveGame({ gameId: 'g1', values, cover: { kind: 'keep' } }, api);

    expect(calls).toEqual(['update']);
    expect(mocks.update).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ titulo: 'Hollow Knight' }),
    );
  });

  it('se o jogo falhar, a exceção sobe e a capa nem é tentada (o duplicado 409 não envia arquivo)', async () => {
    const conflict = httpError(409, { statusCode: 409, message: 'x', fields: { titulo: 'dup' } });
    const { api, calls } = fakeApi({ create: vi.fn(async () => Promise.reject(conflict)) });

    await expect(saveGame({ values, cover: { kind: 'upload', file } }, api)).rejects.toBe(conflict);

    expect(calls).toEqual([]);
  });

  it('jogo salvo e capa falhou: NÃO lança; devolve o jogo salvo e o erro no campo da capa (CA-76)', async () => {
    const storageDown = httpError(502, {
      statusCode: 502,
      message: 'Falha ao acessar o armazenamento de capas',
      fields: { arquivo: 'Falha ao acessar o armazenamento de capas' },
    });
    const { api } = fakeApi({ uploadCover: vi.fn(async () => Promise.reject(storageDown)) });

    const result = await saveGame({ values, cover: { kind: 'upload', file } }, api);

    expect(result.game.id).toBe('g1');
    expect(result.coverError?.fields.capa).toBe('Falha ao acessar o armazenamento de capas');
  });

  it('capa sem resposta depois de o jogo salvo: não diz que nada foi salvo (pwa-e-mobile CA-23)', async () => {
    const { api } = fakeApi({
      uploadCover: vi.fn(async () =>
        Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK')),
      ),
    });

    const result = await saveGame({ values, cover: { kind: 'upload', file } }, api);

    expect(result.game.id).toBe('g1');
    expect(result.coverError?.message).toMatch(/O jogo foi salvo, mas a capa não/);
    expect(result.coverError?.message).not.toMatch(/nada foi salvo/i);
  });

  it('depois da falha da capa, salvar de novo é PATCH no id salvo e reenvia a capa, sem 409', async () => {
    const storageDown = httpError(502, { statusCode: 502, message: 'x', fields: { arquivo: 'x' } });
    const first = fakeApi({ uploadCover: vi.fn(async () => Promise.reject(storageDown)) });
    const firstResult = await saveGame({ values, cover: { kind: 'upload', file } }, first.api);
    expect(first.calls).toEqual(['create']);

    const second = fakeApi();
    const retry = await saveGame(
      { gameId: firstResult.game.id, values, cover: { kind: 'upload', file } },
      second.api,
    );

    expect(second.calls).toEqual(['update', 'uploadCover']);
    expect(second.mocks.create).not.toHaveBeenCalled();
    expect(retry.coverError).toBeNull();
  });

  it('remover a capa de um jogo que a tem chama DELETE /capa (CA-78)', async () => {
    const withCover = game({ capaUrl: 'https://s/capas/g1/a.png' });
    const { api, calls } = fakeApi({ update: vi.fn(async () => withCover) });

    const result = await saveGame({ gameId: 'g1', values, cover: { kind: 'remove' } }, api);

    expect(calls).toEqual(['removeCover']);
    expect(result.game.capaUrl).toBeNull();
  });

  it('remover a capa de um jogo que não tem capa não chama a API', async () => {
    const { api, mocks } = fakeApi();

    await saveGame({ gameId: 'g1', values, cover: { kind: 'remove' } }, api);

    expect(mocks.removeCover).not.toHaveBeenCalled();
  });
});
