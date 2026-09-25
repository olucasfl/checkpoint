import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type AddressInfo } from 'node:net';
import { ProxyDiagController } from './proxy-diag.controller';

// TEMPORÁRIO (branch de diagnóstico): o endpoint só devolve cabeçalhos de proxy, nunca dado sensível.
describe('ProxyDiagController (diagnóstico temporário)', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ProxyDiagController] }).compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/diag/proxy`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('devolve o socket, o X-Forwarded-For separado em entradas e só cabeçalhos de proxy', async () => {
    const response = await fetch(url, {
      headers: {
        'x-forwarded-for': '203.0.113.10, 198.51.100.7',
        authorization: 'Bearer segredo-que-nao-pode-voltar',
        cookie: 'checkpoint_refresh=segredo-que-nao-pode-voltar',
      },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toMatchObject({
      socketRemoteAddress: '127.0.0.1',
      xForwardedForEntradas: ['203.0.113.10', '198.51.100.7'],
      quantidadeDeEntradas: 2,
    });
    expect(JSON.stringify(body)).not.toContain('segredo-que-nao-pode-voltar');
    expect(Object.keys(body.headersDeProxy as object)).toEqual(['x-forwarded-for']);
  });
});
