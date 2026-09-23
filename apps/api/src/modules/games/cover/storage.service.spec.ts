import { BadGatewayException, Logger } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { type EnvironmentVariables } from '../../../config/env.validation';
import { StorageService } from './storage.service';

// Chave sintética e óbvia (RULES.md §8): nenhum teste usa segredo real nem fala com o Supabase.
const FAKE_KEY = 'sb_secret_CHAVE_SINTETICA_DE_TESTE';
const OBJECT_PATH = '3f2b8a52-9c1e-4d6a-8f31-0a7e5b2c9d44/7d1c2e60-1111-4222-8333-444455556666.png';

function createService(): StorageService {
  const values: Record<string, string> = {
    SUPABASE_URL: 'https://abc.supabase.co/',
    SUPABASE_SERVICE_ROLE_KEY: FAKE_KEY,
    SUPABASE_STORAGE_BUCKET: 'capas',
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<
    EnvironmentVariables,
    true
  >;
  return new StorageService(config);
}

function lastCall(fetchMock: jest.SpyInstance) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
}

async function failure(promise: Promise<unknown>): Promise<BadGatewayException> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(BadGatewayException);
    return error as BadGatewayException;
  }
  throw new Error('esperava que o storage falhasse');
}

describe('StorageService', () => {
  let fetchMock: jest.SpyInstance;
  let logError: jest.SpyInstance;

  beforeEach(() => {
    // Nenhuma request real: o fetch global é substituído em todo teste.
    fetchMock = jest.spyOn(globalThis, 'fetch');
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('publicUrl', () => {
    it('monta a URL pública sem chamar a rede, sem barra dupla', () => {
      expect(createService().publicUrl(OBJECT_PATH)).toBe(
        `https://abc.supabase.co/storage/v1/object/public/capas/${OBJECT_PATH}`,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('codifica cada segmento do caminho, mantendo as barras', () => {
      expect(createService().publicUrl('a b/c#d.png')).toBe(
        'https://abc.supabase.co/storage/v1/object/public/capas/a%20b/c%23d.png',
      );
    });
  });

  describe('upload', () => {
    it('faz POST em /object/{bucket}/{path} autenticando SÓ com apikey (CA-53)', async () => {
      fetchMock.mockResolvedValue(new Response('{"Key":"capas/x"}', { status: 200 }));
      const content = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

      await createService().upload(OBJECT_PATH, content, 'image/png');

      const { url, init, headers } = lastCall(fetchMock);
      expect(url).toBe(`https://abc.supabase.co/storage/v1/object/capas/${OBJECT_PATH}`);
      expect(init.method).toBe('POST');
      expect(headers).toMatchObject({
        apikey: FAKE_KEY,
        'content-type': 'image/png',
        'x-upsert': 'false',
      });
      // A secret key não é JWT: a documentação manda o apikey, nunca Authorization: Bearer.
      expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain('authorization');
      expect(init.body).toBe(content);
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('resposta não-2xx vira 502 com a mensagem fixa em fields.arquivo (CA-63)', async () => {
      fetchMock.mockResolvedValue(
        new Response(
          '{"statusCode":"403","message":"new row violates row-level security policy"}',
          {
            status: 403,
          },
        ),
      );

      const error = await failure(
        createService().upload(OBJECT_PATH, Buffer.from('x'), 'image/png'),
      );

      expect(error.getStatus()).toBe(502);
      expect(error.getResponse()).toEqual({
        statusCode: 502,
        message: 'Falha ao acessar o armazenamento de capas',
        fields: { arquivo: 'Falha ao acessar o armazenamento de capas' },
      });
    });

    it('erro de rede vira 502 (CA-63)', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      await failure(createService().upload(OBJECT_PATH, Buffer.from('x'), 'image/png'));
    });

    it('timeout vira 502 (CA-63)', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));

      await failure(createService().upload(OBJECT_PATH, Buffer.from('x'), 'image/png'));
    });
  });

  describe('remove', () => {
    it('faz DELETE em /object/{bucket} com {"prefixes":[path]} (CA-64)', async () => {
      fetchMock.mockResolvedValue(new Response('[]', { status: 200 }));

      await createService().remove(OBJECT_PATH);

      const { url, init, headers } = lastCall(fetchMock);
      expect(url).toBe('https://abc.supabase.co/storage/v1/object/capas');
      expect(init.method).toBe('DELETE');
      expect(JSON.parse(init.body as string)).toEqual({ prefixes: [OBJECT_PATH] });
      expect(headers).toMatchObject({ apikey: FAKE_KEY, 'content-type': 'application/json' });
      expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain('authorization');
    });

    it('remover objeto inexistente não é erro (resposta 200 com lista vazia)', async () => {
      fetchMock.mockResolvedValue(new Response('[]', { status: 200 }));

      await expect(createService().remove(OBJECT_PATH)).resolves.toBeUndefined();
    });

    it('resposta não-2xx vira 502 (CA-65)', async () => {
      fetchMock.mockResolvedValue(new Response('{"message":"erro"}', { status: 500 }));

      const error = await failure(createService().remove(OBJECT_PATH));

      expect(error.getStatus()).toBe(502);
    });
  });

  describe('segredos', () => {
    it('o log registra status HTTP e mensagem, e nunca a chave nem cabeçalhos', async () => {
      fetchMock.mockResolvedValue(
        new Response('{"statusCode":"401","message":"Invalid API key"}', { status: 401 }),
      );

      await failure(createService().upload(OBJECT_PATH, Buffer.from('x'), 'image/png'));

      const logged = JSON.stringify(logError.mock.calls);
      expect(logged).toContain('401');
      expect(logged).toContain('Invalid API key');
      expect(logged).not.toContain(FAKE_KEY);
      expect(logged.toLowerCase()).not.toContain('apikey');
    });

    it('o erro de rede é registrado só pelo tipo, sem a chave', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      await failure(createService().remove(OBJECT_PATH));

      const logged = JSON.stringify(logError.mock.calls);
      expect(logged).toContain('TypeError');
      expect(logged).not.toContain(FAKE_KEY);
    });

    it('não repassa o corpo da resposta do Supabase ao cliente da API', async () => {
      fetchMock.mockResolvedValue(
        new Response('{"message":"detalhe interno do Supabase"}', { status: 400 }),
      );

      const error = await failure(createService().remove(OBJECT_PATH));

      expect(JSON.stringify(error.getResponse())).not.toContain('detalhe interno');
    });

    it('resposta de erro sem JSON não quebra o log', async () => {
      fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }));

      await failure(createService().remove(OBJECT_PATH));

      expect(JSON.stringify(logError.mock.calls)).toContain('502');
    });
  });
});
