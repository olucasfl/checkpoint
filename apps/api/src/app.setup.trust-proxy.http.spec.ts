import { Controller, Get, type INestApplication, Req, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import { type Request } from 'express';
import { type AddressInfo } from 'node:net';
import { setupApp } from './app.setup';
import { AuthThrottlerGuard } from './modules/auth/auth-throttler.guard';

/**
 * Regressão do limite por IP atrás de proxy. Sem `trust proxy`, o `req.ip` é o endereço do socket, que em
 * produção (Vercel → Render) é o do proxy: todo mundo cai no MESMO contador (login 5/min, registro 3/h,
 * troca de senha…). Aqui o app sobe com o `setupApp()` de verdade (é ele que configura o proxy) e o
 * `AuthThrottlerGuard` de verdade, numa porta local; o "proxy" é o próprio teste, que fala com a API por
 * 127.0.0.1 e manda o `X-Forwarded-For` como um proxy mandaria.
 */
const LIMIT = 2;

@Controller('ip')
@UseGuards(AuthThrottlerGuard)
class IpStubController {
  @Get()
  @Throttle({ default: { limit: LIMIT, ttl: 60_000 } })
  quem(@Req() req: Request): { ip: string | undefined } {
    return { ip: req.ip };
  }
}

let app: INestApplication;
let baseUrl: string;

async function start(trustProxyHops?: number): Promise<void> {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            CORS_ORIGIN: 'http://localhost:5173',
            ...(trustProxyHops === undefined ? {} : { TRUST_PROXY_HOPS: trustProxyHops }),
          }),
        ],
      }),
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    ],
    controllers: [IpStubController],
    providers: [AuthThrottlerGuard],
  }).compile();

  app = module.createNestApplication({ logger: false });
  setupApp(app);
  await app.listen(0, '127.0.0.1');
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;
}

async function pedir(xForwardedFor?: string): Promise<{ status: number; ip?: string }> {
  const response = await fetch(`${baseUrl}/ip`, {
    headers: xForwardedFor === undefined ? {} : { 'x-forwarded-for': xForwardedFor },
  });
  const body = (await response.json().catch(() => ({}))) as { ip?: string };
  return { status: response.status, ip: body.ip };
}

async function statuses(...cabecalhos: (string | undefined)[]): Promise<number[]> {
  const result: number[] = [];
  for (const cabecalho of cabecalhos) {
    result.push((await pedir(cabecalho)).status);
  }
  return result;
}

afterEach(async () => {
  await app.close();
});

describe('trust proxy no limite por IP (bug: contador único atrás do proxy)', () => {
  describe('TRUST_PROXY_HOPS=1 (um proxy confiável na frente da API)', () => {
    beforeEach(() => start(1));

    it('o IP usado é o do cliente que o proxy viu, não o do proxy', async () => {
      await expect(pedir('203.0.113.10')).resolves.toEqual({ status: 200, ip: '203.0.113.10' });
    });

    it('dois clientes diferentes contam em limites separados', async () => {
      const a = '203.0.113.10';
      const b = '203.0.113.20';

      // O cliente A esgota o limite (2 por minuto) e leva 429 no 3º...
      expect(await statuses(a, a, a)).toEqual([200, 200, 429]);
      // ...mas o cliente B, atrás do mesmo proxy, tem o próprio contador.
      expect(await statuses(b, b, b)).toEqual([200, 200, 429]);
    });

    it('um cabeçalho forjado ALÉM dos saltos confiáveis não muda o IP usado', async () => {
      // O proxy confiável anexa o endereço REAL do cliente ao fim do cabeçalho; o que o cliente forjou vem antes.
      const real = '203.0.113.10';

      const respostas = [
        await pedir(`6.6.6.6, ${real}`),
        await pedir(`7.7.7.7, ${real}`),
        await pedir(`8.8.8.8, 9.9.9.9, ${real}`),
      ];

      // O 429 não traz corpo: o IP se confere nas duas respostas 200, e o 429 do 3º prova o mesmo contador.
      expect(respostas.slice(0, 2).map((r) => r.ip)).toEqual([real, real]);
      // Trocar o valor forjado a cada pedido NÃO devolve um contador zerado: o 3º pedido leva 429.
      expect(respostas.map((r) => r.status)).toEqual([200, 200, 429]);
    });
  });

  describe('TRUST_PROXY_HOPS=2 (dois proxies confiáveis, como Vercel + Render)', () => {
    beforeEach(() => start(2));

    it('o IP usado é o cliente, e o que foi forjado antes dele é ignorado', async () => {
      // cliente → proxy 1 → proxy 2 → API: o proxy 1 anexa o cliente e o proxy 2 anexa o proxy 1.
      const cliente = '203.0.113.10';
      const proxy1 = '198.51.100.7';

      await expect(pedir(`${cliente}, ${proxy1}`)).resolves.toMatchObject({ ip: cliente });
      await expect(pedir(`6.6.6.6, ${cliente}, ${proxy1}`)).resolves.toMatchObject({ ip: cliente });
    });

    it('dois clientes diferentes contam em limites separados', async () => {
      const proxy1 = '198.51.100.7';

      expect(await statuses(...Array<string>(3).fill(`203.0.113.10, ${proxy1}`))).toEqual([
        200, 200, 429,
      ]);
      expect(await statuses(...Array<string>(3).fill(`203.0.113.20, ${proxy1}`))).toEqual([
        200, 200, 429,
      ]);
    });
  });

  describe('sem TRUST_PROXY_HOPS (padrão seguro: 0, não confia em cabeçalho nenhum)', () => {
    beforeEach(() => start());

    it('ignora o X-Forwarded-For: o IP é o do socket, e forjar o cabeçalho não escapa do limite', async () => {
      const respostas = [await pedir('1.1.1.1'), await pedir('2.2.2.2'), await pedir('3.3.3.3')];

      expect(respostas.slice(0, 2).map((r) => r.ip)).toEqual(['127.0.0.1', '127.0.0.1']);
      expect(respostas.map((r) => r.status)).toEqual([200, 200, 429]);
    });
  });
});
