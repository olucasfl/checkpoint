import { type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiClient } from '@/shared/lib/api-client';
import { gamesApi } from './games-api';

/**
 * Inspeciona a requisição que o axios REALMENTE monta (depois do transformRequest), trocando só o
 * adaptador de rede. Regressão achada na verificação real: com o Content-Type JSON padrão do
 * apiClient o axios transformava o FormData em JSON e o upload da capa chegava vazio (400).
 */
let captured: InternalAxiosRequestConfig | undefined;
const originalAdapter = apiClient.defaults.adapter;

beforeEach(() => {
  captured = undefined;
  apiClient.defaults.adapter = async (config) => {
    captured = config;
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
  };
});

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
});

describe('gamesApi.uploadCover', () => {
  it('envia o arquivo como multipart no campo "arquivo", e não como JSON', async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'capa.png', { type: 'image/png' });

    await gamesApi.uploadCover('g1', file);

    expect(captured?.method).toBe('put');
    expect(captured?.url).toBe('/games/g1/capa');
    expect(captured?.data).toBeInstanceOf(FormData);
    expect((captured?.data as FormData).get('arquivo')).toBeInstanceOf(File);
    expect(String(captured?.headers.get('Content-Type'))).not.toContain('application/json');
  });
});

describe('gamesApi — o resto continua em JSON', () => {
  it('criar e editar enviam JSON', async () => {
    await gamesApi.create({ titulo: 'Hades', status: 'JOGANDO' });
    expect(String(captured?.headers.get('Content-Type'))).toContain('application/json');
    expect(captured?.data).toBe('{"titulo":"Hades","status":"JOGANDO"}');

    await gamesApi.update('g1', { gameplay: null });
    expect(captured?.method).toBe('patch');
    expect(captured?.data).toBe('{"gameplay":null}');
  });

  it('remover a capa é um DELETE em /games/:id/capa', async () => {
    await gamesApi.removeCover('g1');

    expect(captured?.method).toBe('delete');
    expect(captured?.url).toBe('/games/g1/capa');
  });
});
