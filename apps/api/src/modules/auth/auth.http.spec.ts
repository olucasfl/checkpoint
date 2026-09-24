import { Controller, Get, type INestApplication, type LoggerService } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { type AddressInfo } from 'node:net';
import { CSRF_HEADER } from '@checkpoint/shared';
import { IS_PUBLIC_KEY, Public } from '../../common/decorators/public.decorator';
import { createValidationPipe } from '../../common/pipes/app-validation.pipe';
import { API_GLOBAL_PREFIX, parseCorsOrigin } from '../../config/app.config';
import { PrismaService } from '../../database/prisma.service';
import { GamesController } from '../games/games.controller';
import { HealthController } from '../health/health.controller';
import { AccessTokenGuard } from './access-token.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthThrottlerGuard } from './auth-throttler.guard';
import { AuthTokensService } from './auth-tokens.service';
import { PASSWORD_CHANGE_LIMIT } from './auth.constants';
import { CsrfHeaderGuard } from './csrf-header.guard';
import { PasswordHasher } from './password-hasher';
import { FakeAuthPrisma, fakeHasher } from './testing/fake-auth-prisma';

/**
 * Sobe o módulo de auth de verdade (controller, pipe global, guard global, throttler, CORS e
 * cookie-parser) numa porta local e fala HTTP por `fetch`. Prisma em memória e hasher instantâneo:
 * nenhum teste toca o banco real. Cobre o que os specs de service e de guard não veem: cabeçalhos,
 * cookies, códigos HTTP, o pipe ligado, o limite por IP e o CORS.
 */
const ORIGIN = 'http://localhost:5173';
const ENV = {
  NODE_ENV: 'development',
  JWT_ACCESS_SECRET: 'segredo-de-acesso-sintetico-com-mais-de-32-caracteres',
  JWT_REFRESH_SECRET: 'segredo-de-refresh-sintetico-com-mais-de-32-caracteres',
  AUTH_REGISTRATION_OPEN: true,
};

@Controller('protegido')
class ProtectedStubController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

@Controller('aberto')
class OpenStubController {
  @Public()
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

/** Guarda tudo o que a aplicação loga, para provar que nenhum segredo passa por ali (CA-20). */
class CollectingLogger implements LoggerService {
  lines: string[] = [];
  log(message: unknown): void {
    this.lines.push(String(message));
  }
  error(message: unknown, ...rest: unknown[]): void {
    this.lines.push([message, ...rest].map(String).join(' '));
  }
  warn(message: unknown): void {
    this.lines.push(String(message));
  }
  debug(message: unknown): void {
    this.lines.push(String(message));
  }
  verbose(message: unknown): void {
    this.lines.push(String(message));
  }
}

interface Reply {
  status: number;
  text: string;
  json: Record<string, unknown> | undefined;
  headers: Headers;
  setCookies: string[];
}

let app: INestApplication;
let baseUrl: string;
let db: FakeAuthPrisma;
let logger: CollectingLogger;
/** Todo corpo de resposta recebido, para a busca de dados sensíveis (CA-20). */
let bodies: string[];

async function start(env: Record<string, unknown> = ENV): Promise<void> {
  db = new FakeAuthPrisma();
  logger = new CollectingLogger();
  bodies = [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }),
      JwtModule.register({}),
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    ],
    controllers: [AuthController, ProtectedStubController, OpenStubController],
    providers: [
      AuthService,
      AuthTokensService,
      AuthThrottlerGuard,
      CsrfHeaderGuard,
      { provide: PasswordHasher, useValue: fakeHasher },
      { provide: PrismaService, useValue: db },
      { provide: APP_GUARD, useClass: AccessTokenGuard },
    ],
  }).compile();

  app = moduleRef.createNestApplication({ logger });
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.use(cookieParser());
  app.enableCors({ origin: parseCorsOrigin(ORIGIN), credentials: true });
  app.useGlobalPipes(createValidationPipe());
  await app.listen(0, '127.0.0.1');

  const { port } = app.getHttpServer().address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/${API_GLOBAL_PREFIX}`;
}

interface CallOptions {
  body?: unknown;
  cookie?: string;
  bearer?: string;
  csrf?: boolean;
  headers?: Record<string, string>;
}

async function call(method: string, path: string, options: CallOptions = {}): Promise<Reply> {
  const headers: Record<string, string> = { 'user-agent': 'curl/8.5.0', ...options.headers };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (options.cookie) {
    headers.cookie = `checkpoint_refresh=${options.cookie}`;
  }
  if (options.bearer) {
    headers.authorization = `Bearer ${options.bearer}`;
  }
  if (options.csrf) {
    headers[CSRF_HEADER] = '1';
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  bodies.push(text);
  return {
    status: response.status,
    text,
    json: text ? (JSON.parse(text) as Record<string, unknown>) : undefined,
    headers: response.headers,
    setCookies: response.headers.getSetCookie(),
  };
}

const cookieValue = (reply: Reply): string =>
  /checkpoint_refresh=([^;]*)/.exec(reply.setCookies[0] ?? '')?.[1] ?? '';

const ANA = { nome: ' Ana Teste ', email: '  Ana@Exemplo.COM ', senha: 'segredo-forte' };

async function registerAna(): Promise<{ reply: Reply; refresh: string; access: string }> {
  const reply = await call('POST', '/auth/registro', { body: ANA });
  return {
    reply,
    refresh: cookieValue(reply),
    access: (reply.json as { accessToken: string }).accessToken,
  };
}

beforeEach(async () => {
  delete process.env.AUTH_REGISTRATION_LIMIT_PER_HOUR;
  jest.spyOn(Date, 'now');
  await start();
});

afterEach(async () => {
  jest.restoreAllMocks();
  delete process.env.AUTH_REGISTRATION_LIMIT_PER_HOUR;
  await app.close();
});

describe('POST /auth/registro', () => {
  it('201 com accessToken e usuario, e o cookie do refresh com os atributos da spec (CA-01)', async () => {
    const { reply } = await registerAna();

    expect(reply.status).toBe(201);
    expect(reply.json).toEqual({
      accessToken: expect.any(String),
      usuario: {
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-/),
        nome: 'Ana Teste',
        email: 'ana@exemplo.com',
        criadoEm: expect.any(String),
      },
    });
    const [cookie] = reply.setCookies;
    expect(cookie).toMatch(/^checkpoint_refresh=[^;]+;/);
    expect(cookie).toContain('Max-Age=2592000');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
  });

  it('em produção o cookie ganha Secure', async () => {
    await app.close();
    await start({ ...ENV, NODE_ENV: 'production' });

    const reply = await call('POST', '/auth/registro', { body: ANA });

    expect(reply.setCookies[0]).toContain('Secure');
  });

  it('o refresh token NÃO vem no corpo, só no cookie (CA-20)', async () => {
    const { reply, refresh } = await registerAna();

    expect(refresh.length).toBeGreaterThan(20);
    expect(reply.text).not.toContain(refresh);
    expect(Object.keys(reply.json ?? {}).sort()).toEqual(['accessToken', 'usuario']);
  });

  it('e-mail repetido → 409 AUTH_EMAIL_EM_USO com fields.email (CA-02)', async () => {
    await registerAna();

    const reply = await call('POST', '/auth/registro', {
      body: { ...ANA, email: 'ANA@exemplo.com ' },
    });

    expect(reply.status).toBe(409);
    expect(reply.json).toMatchObject({
      code: 'AUTH_EMAIL_EM_USO',
      fields: { email: expect.any(String) },
    });
    expect(db.users).toHaveLength(1);
  });

  it.each([
    ['nome vazio', { nome: '' }, 'nome'],
    ['nome de 61 caracteres', { nome: 'a'.repeat(61) }, 'nome'],
    ['e-mail "ana"', { email: 'ana' }, 'email'],
    ['senha de 7 caracteres', { senha: '1234567' }, 'senha'],
    ['senha de 37 "á" (74 bytes)', { senha: 'á'.repeat(37) }, 'senha'],
    ['senha de 8 espaços', { senha: ' '.repeat(8) }, 'senha'],
  ])('400 VALIDACAO com fields.%s (CA-03)', async (_nome, override, field) => {
    const reply = await call('POST', '/auth/registro', { body: { ...ANA, ...override } });

    expect(reply.status).toBe(400);
    expect(reply.json).toMatchObject({
      code: 'VALIDACAO',
      fields: { [field]: expect.any(String) },
    });
    expect(db.users).toHaveLength(0);
  });

  it('campo extra {"admin":true} → 400 (CA-03f)', async () => {
    const reply = await call('POST', '/auth/registro', { body: { ...ANA, admin: true } });

    expect(reply.status).toBe(400);
    expect(db.users).toHaveLength(0);
  });

  it('senha de 36 "á" (72 bytes) é aceita (CA-03)', async () => {
    const reply = await call('POST', '/auth/registro', {
      body: { ...ANA, senha: 'á'.repeat(36) },
    });

    expect(reply.status).toBe(201);
  });

  it('um body hostil ({"senha":{"toString":"x"}}) é 400, nunca 500', async () => {
    const reply = await call('POST', '/auth/registro', {
      body: { ...ANA, senha: { toString: 'x' } },
    });

    expect(reply.status).toBe(400);
  });

  it('registro fechado → 403 AUTH_REGISTRO_FECHADO; nenhum usuário; o login existente segue (CA-04)', async () => {
    await registerAna();
    await app.close();
    const contas = db.users;
    await start({ ...ENV, AUTH_REGISTRATION_OPEN: false });
    db.users.push(...contas);

    const fechado = await call('POST', '/auth/registro', {
      body: { nome: 'Bia', email: 'bia@exemplo.com', senha: 'outra-senha-boa' },
    });
    const login = await call('POST', '/auth/login', {
      body: { email: 'ana@exemplo.com', senha: 'segredo-forte' },
    });

    expect(fechado.status).toBe(403);
    expect(fechado.json).toMatchObject({ code: 'AUTH_REGISTRO_FECHADO' });
    expect(db.users).toHaveLength(1);
    expect(login.status).toBe(200);
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await registerAna();
    db.sessions = [];
  });

  it('200 com accessToken, usuario e cookie novo; cria uma sessão com o hash de 64 hex (CA-05)', async () => {
    const reply = await call('POST', '/auth/login', {
      body: { email: ' ANA@exemplo.com', senha: 'segredo-forte' },
    });

    expect(reply.status).toBe(200);
    expect(reply.json).toMatchObject({ usuario: { email: 'ana@exemplo.com' } });
    expect(db.sessions).toHaveLength(1);
    expect(db.sessions[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(db.sessions[0]?.tokenHash).not.toBe(cookieValue(reply));
    expect(db.sessions[0]?.dispositivo).toBe('Outro · Outro');
  });

  it('senha errada e e-mail inexistente: mesmo status e MESMO corpo, sem fields (CA-06)', async () => {
    const errada = await call('POST', '/auth/login', {
      body: { email: 'ana@exemplo.com', senha: 'senha-errada' },
    });
    const inexistente = await call('POST', '/auth/login', {
      body: { email: 'nao-existe@exemplo.com', senha: 'segredo-forte' },
    });

    expect(errada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(errada.text).toBe(inexistente.text);
    expect(errada.json).toEqual({
      statusCode: 401,
      code: 'AUTH_CREDENCIAIS_INVALIDAS',
      message: 'E-mail ou senha incorretos.',
    });
  });

  it('7 caracteres no login NÃO é 400 (a regra do tamanho mínimo é do registro)', async () => {
    const reply = await call('POST', '/auth/login', {
      body: { email: 'ana@exemplo.com', senha: '1234567' },
    });

    expect(reply.status).toBe(401);
  });
});

describe('GET /auth/me e o guard global (CA-07, CA-17)', () => {
  it('200 com o Usuario e um Bearer válido; sem cabeçalho 401 AUTH_NAO_AUTENTICADO', async () => {
    const { access } = await registerAna();

    const ok = await call('GET', '/auth/me', { bearer: access });
    const sem = await call('GET', '/auth/me');

    expect(ok.status).toBe(200);
    expect(ok.json).toEqual({
      id: expect.any(String),
      nome: 'Ana Teste',
      email: 'ana@exemplo.com',
      criadoEm: expect.any(String),
    });
    expect(sem.status).toBe(401);
    expect(sem.json).toMatchObject({ code: 'AUTH_NAO_AUTENTICADO' });
  });

  it('token alterado num caractere → 401 AUTH_NAO_AUTENTICADO', async () => {
    const { access } = await registerAna();
    const alterado = access.slice(0, -2) + (access.endsWith('A') ? 'B' : 'A') + access.slice(-1);

    const reply = await call('GET', '/auth/me', { bearer: alterado });

    expect(reply.status).toBe(401);
    expect(reply.json).toMatchObject({ code: 'AUTH_NAO_AUTENTICADO' });
  });

  it('o REFRESH token (valor do cookie) como Bearer → 401 AUTH_NAO_AUTENTICADO', async () => {
    const { refresh } = await registerAna();

    const reply = await call('GET', '/auth/me', { bearer: refresh });

    expect(reply.status).toBe(401);
    expect(reply.json).toMatchObject({ code: 'AUTH_NAO_AUTENTICADO' });
  });

  it('access token vencido (16 min) → 401 AUTH_TOKEN_EXPIRADO (CA-08)', async () => {
    const { access } = await registerAna();
    const realNow = Date.now();
    // a sessão precisa estar viva: ela vence em 30 dias
    (Date.now as jest.Mock).mockReturnValue(realNow + 16 * 60 * 1000);

    const reply = await call('GET', '/auth/me', { bearer: access });

    expect(reply.status).toBe(401);
    expect(reply.json).toMatchObject({ code: 'AUTH_TOKEN_EXPIRADO' });
  });

  it('rota @Public() responde sem token e uma rota sem o decorator é fechada', async () => {
    const aberta = await call('GET', '/aberto');
    const fechada = await call('GET', '/protegido');

    expect(aberta.status).toBe(200);
    expect(fechada.status).toBe(401);
  });

  it('health continua público; o catálogo de jogos deixou de ser na etapa 3 (CA-17, CA-41)', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, GamesController)).toBeUndefined();
  });
});

describe('POST /auth/refresh (CA-09 a CA-12)', () => {
  it('200 com accessToken novo e cookie novo, na MESMA linha de sessão (CA-09)', async () => {
    const { refresh, access } = await registerAna();
    // O access token não tem `jti` (payload da spec): dois no mesmo segundo seriam idênticos.
    (Date.now as jest.Mock).mockReturnValue(Date.now() + 1_000);

    const reply = await call('POST', '/auth/refresh', { cookie: refresh, csrf: true });

    expect(reply.status).toBe(200);
    expect(cookieValue(reply)).not.toBe(refresh);
    expect((reply.json as { accessToken: string }).accessToken).not.toBe(access);
    expect(db.sessions).toHaveLength(1);
  });

  it('o cookie ANTERIOR em até 30 s → 409 AUTH_REFRESH_CONCORRENTE; o novo ainda renova (CA-10)', async () => {
    const { refresh: velho } = await registerAna();
    const primeiro = await call('POST', '/auth/refresh', { cookie: velho, csrf: true });
    const novo = cookieValue(primeiro);

    const concorrente = await call('POST', '/auth/refresh', { cookie: velho, csrf: true });
    const seguinte = await call('POST', '/auth/refresh', { cookie: novo, csrf: true });

    expect(concorrente.status).toBe(409);
    expect(concorrente.json).toMatchObject({ code: 'AUTH_REFRESH_CONCORRENTE' });
    expect(seguinte.status).toBe(200);
  });

  it('o cookie anterior depois de 30 s → 401, cookie limpo, sessão apagada, e o novo também morre (CA-11)', async () => {
    const { refresh: velho } = await registerAna();
    const primeiro = await call('POST', '/auth/refresh', { cookie: velho, csrf: true });
    const novo = cookieValue(primeiro);
    (Date.now as jest.Mock).mockReturnValue(Date.now() + 31_000);

    const reuso = await call('POST', '/auth/refresh', { cookie: velho, csrf: true });
    const depois = await call('POST', '/auth/refresh', { cookie: novo, csrf: true });

    expect(reuso.status).toBe(401);
    expect(reuso.json).toMatchObject({ code: 'AUTH_SESSAO_ENCERRADA' });
    expect(reuso.setCookies[0]).toContain('Max-Age=0');
    expect(db.sessions).toHaveLength(0);
    expect(depois.status).toBe(401);
    // o aviso de reuso tem o id da sessão e nenhum token
    const avisos = logger.lines.filter((line) => line.includes('reutilizado'));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).not.toContain(velho);
    expect(avisos[0]).not.toContain(novo);
  });

  it('sem cookie → 401 AUTH_SESSAO_ENCERRADA (CA-12)', async () => {
    const reply = await call('POST', '/auth/refresh', { csrf: true });

    expect(reply.status).toBe(401);
    expect(reply.json).toMatchObject({ code: 'AUTH_SESSAO_ENCERRADA' });
    expect(reply.setCookies[0]).toContain('Max-Age=0');
  });

  it('cookie válido SEM o cabeçalho anti-CSRF → 403 AUTH_ORIGEM_INVALIDA e a sessão não rotaciona (CA-12)', async () => {
    const { refresh } = await registerAna();
    const antes = JSON.stringify(db.sessions);

    const reply = await call('POST', '/auth/refresh', { cookie: refresh });

    expect(reply.status).toBe(403);
    expect(reply.json).toMatchObject({ code: 'AUTH_ORIGEM_INVALIDA' });
    expect(JSON.stringify(db.sessions)).toBe(antes);
  });

  it('o cabeçalho tem de valer exatamente "1"', async () => {
    const { refresh } = await registerAna();

    const reply = await call('POST', '/auth/refresh', {
      cookie: refresh,
      headers: { [CSRF_HEADER]: 'true' },
    });

    expect(reply.status).toBe(403);
  });
});

describe('POST /auth/logout (CA-13, CA-14)', () => {
  it('204, cookie com Max-Age=0, sessão apagada, e o access token dela cai NA HORA', async () => {
    const { refresh, access } = await registerAna();

    const reply = await call('POST', '/auth/logout', { cookie: refresh, csrf: true });
    const me = await call('GET', '/auth/me', { bearer: access });

    expect(reply.status).toBe(204);
    expect(reply.text).toBe('');
    expect(reply.setCookies[0]).toContain('Max-Age=0');
    expect(db.sessions).toHaveLength(0);
    expect(me.status).toBe(401);
    expect(me.json).toMatchObject({ code: 'AUTH_SESSAO_ENCERRADA' });
  });

  it('repetir o logout continua 204 (idempotente)', async () => {
    const { refresh } = await registerAna();
    await call('POST', '/auth/logout', { cookie: refresh, csrf: true });

    const again = await call('POST', '/auth/logout', { cookie: refresh, csrf: true });
    const semCookie = await call('POST', '/auth/logout', { csrf: true });

    expect(again.status).toBe(204);
    expect(semCookie.status).toBe(204);
  });

  it('sem o cabeçalho anti-CSRF → 403 AUTH_ORIGEM_INVALIDA e a sessão continua', async () => {
    const { refresh } = await registerAna();

    const reply = await call('POST', '/auth/logout', { cookie: refresh });

    expect(reply.status).toBe(403);
    expect(db.sessions).toHaveLength(1);
  });

  it('logout em A não derruba B (duas sessões da mesma conta)', async () => {
    const { refresh: a } = await registerAna();
    const loginB = await call('POST', '/auth/login', {
      body: { email: 'ana@exemplo.com', senha: 'segredo-forte' },
    });
    const b = cookieValue(loginB);

    await call('POST', '/auth/logout', { cookie: a, csrf: true });

    const me = await call('GET', '/auth/me', {
      bearer: (loginB.json as { accessToken: string }).accessToken,
    });
    const refresh = await call('POST', '/auth/refresh', { cookie: b, csrf: true });
    expect(me.status).toBe(200);
    expect(refresh.status).toBe(200);
  });
});

describe('limite de tentativas (CA-16)', () => {
  it('o 6º login em menos de 1 minuto → 429 LIMITE_TENTATIVAS com Retry-After', async () => {
    await registerAna();
    const replies: Reply[] = [];
    for (let i = 0; i < 6; i += 1) {
      replies.push(
        await call('POST', '/auth/login', {
          body: { email: 'ana@exemplo.com', senha: 'errada-mesmo' },
        }),
      );
    }

    expect(replies.slice(0, 5).map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
    const sexto = replies[5];
    expect(sexto?.status).toBe(429);
    expect(sexto?.json).toEqual({
      statusCode: 429,
      code: 'LIMITE_TENTATIVAS',
      message: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
    });
    expect(Number(sexto?.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('com AUTH_REGISTRATION_LIMIT_PER_HOUR=2, o 3º registro → 429', async () => {
    process.env.AUTH_REGISTRATION_LIMIT_PER_HOUR = '2';
    const statuses: number[] = [];
    for (const n of [1, 2, 3]) {
      const reply = await call('POST', '/auth/registro', {
        body: { nome: `Conta ${n}`, email: `conta${n}@exemplo.com`, senha: 'segredo-forte' },
      });
      statuses.push(reply.status);
    }

    expect(statuses).toEqual([201, 201, 429]);
  });

  it('sem a env, o padrão é 3 por hora: o 4º registro → 429', async () => {
    const statuses: number[] = [];
    for (const n of [1, 2, 3, 4]) {
      const reply = await call('POST', '/auth/registro', {
        body: { nome: `Conta ${n}`, email: `conta${n}@exemplo.com`, senha: 'segredo-forte' },
      });
      statuses.push(reply.status);
    }

    expect(statuses).toEqual([201, 201, 201, 429]);
  });

  it('o limite de cada rota é independente (login estourado não bloqueia o refresh)', async () => {
    const { refresh } = await registerAna();
    for (let i = 0; i < 6; i += 1) {
      await call('POST', '/auth/login', {
        body: { email: 'x@exemplo.com', senha: 'errada-mesmo' },
      });
    }

    const reply = await call('POST', '/auth/refresh', { cookie: refresh, csrf: true });

    expect(reply.status).toBe(200);
  });
});

describe('CORS (CA-19)', () => {
  it('origem permitida: Allow-Origin igual à origem e Allow-Credentials true', async () => {
    const reply = await call('POST', '/auth/refresh', { headers: { origin: ORIGIN }, csrf: true });

    expect(reply.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(reply.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('origem desconhecida: a resposta NÃO traz Access-Control-Allow-Origin', async () => {
    const reply = await call('POST', '/auth/refresh', {
      headers: { origin: 'http://malicioso.exemplo' },
      csrf: true,
    });

    expect(reply.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('o preflight do cabeçalho anti-CSRF passa para a origem permitida e falha para as outras', async () => {
    const preflight = (origin: string) =>
      call('OPTIONS', '/auth/refresh', {
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': CSRF_HEADER.toLowerCase(),
        },
      });

    const permitido = await preflight(ORIGIN);
    const negado = await preflight('http://malicioso.exemplo');

    expect(permitido.status).toBe(204);
    expect(permitido.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(permitido.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      CSRF_HEADER.toLowerCase(),
    );
    expect(negado.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('nada sensível nos corpos nem nos logs (CA-20)', () => {
  it('senhaHash, tokenHash, hashAnterior, o refresh token e a senha nunca aparecem', async () => {
    const { refresh, access } = await registerAna();
    const login = await call('POST', '/auth/login', {
      body: { email: 'ana@exemplo.com', senha: 'segredo-forte' },
    });
    const refresh2 = await call('POST', '/auth/refresh', { cookie: refresh, csrf: true });
    await call('GET', '/auth/me', { bearer: access });
    await call('POST', '/auth/login', {
      body: { email: 'ana@exemplo.com', senha: 'errada-mesmo' },
    });
    await call('POST', '/auth/logout', { cookie: cookieValue(refresh2), csrf: true });

    const proibidos = [
      'senhaHash',
      'tokenHash',
      'hashAnterior',
      'fake$',
      'segredo-forte',
      'errada-mesmo',
      refresh,
      cookieValue(login),
      cookieValue(refresh2),
    ];
    for (const proibido of proibidos) {
      expect(bodies.join('\n')).not.toContain(proibido);
      expect(logger.lines.join('\n')).not.toContain(proibido);
    }
  });

  it('o access token também não vai para os logs', async () => {
    const { access } = await registerAna();
    await call('GET', '/auth/me', { bearer: access });

    expect(logger.lines.join('\n')).not.toContain(access);
  });
});

describe('PUT /auth/senha (CA-51 a CA-55)', () => {
  /** Ana logada em dois "jars": A (o registro) e B (um login). */
  async function anaEmDoisJars() {
    const a = await registerAna();
    const loginB = await call('POST', '/auth/login', {
      body: { email: 'ana@exemplo.com', senha: 'segredo-forte' },
    });
    return {
      a,
      b: {
        refresh: cookieValue(loginB),
        access: (loginB.json as { accessToken: string }).accessToken,
      },
    };
  }

  const troca = (bearer: string | undefined, body: unknown) =>
    call('PUT', '/auth/senha', { bearer, body });

  it('204 sem corpo; A continua, B cai na hora; a senha antiga não entra e a nova entra (CA-51)', async () => {
    const { a, b } = await anaEmDoisJars();

    const reply = await troca(a.access, {
      senhaAtual: 'segredo-forte',
      novaSenha: 'outra-senha-boa',
    });

    expect(reply.status).toBe(204);
    expect(reply.text).toBe('');
    expect((await call('GET', '/auth/me', { bearer: a.access })).status).toBe(200);
    expect((await call('POST', '/auth/refresh', { cookie: a.refresh, csrf: true })).status).toBe(
      200,
    );
    const meB = await call('GET', '/auth/me', { bearer: b.access });
    expect(meB.status).toBe(401);
    expect(meB.json).toMatchObject({ code: 'AUTH_SESSAO_ENCERRADA' });
    expect((await call('POST', '/auth/refresh', { cookie: b.refresh, csrf: true })).status).toBe(
      401,
    );
    const antiga = await call('POST', '/auth/login', {
      body: { email: 'ana@exemplo.com', senha: 'segredo-forte' },
    });
    const nova = await call('POST', '/auth/login', {
      body: { email: 'ana@exemplo.com', senha: 'outra-senha-boa' },
    });
    expect(antiga.status).toBe(401);
    expect(nova.status).toBe(200);
  });

  it('senha atual errada → 400 AUTH_SENHA_ATUAL_INCORRETA; B continua logado (CA-52)', async () => {
    const { a, b } = await anaEmDoisJars();

    const reply = await troca(a.access, { senhaAtual: 'nao-e-esta', novaSenha: 'outra-senha-boa' });

    expect(reply.status).toBe(400);
    expect(reply.json).toEqual({
      statusCode: 400,
      code: 'AUTH_SENHA_ATUAL_INCORRETA',
      message: 'Senha atual incorreta.',
      fields: { senhaAtual: 'Senha atual incorreta.' },
    });
    expect((await call('GET', '/auth/me', { bearer: b.access })).status).toBe(200);
  });

  it('nova igual à atual → 400 AUTH_SENHA_IGUAL_ATUAL com fields.novaSenha (CA-53)', async () => {
    const { access } = await registerAna();

    const reply = await troca(access, { senhaAtual: 'segredo-forte', novaSenha: 'segredo-forte' });

    expect(reply.status).toBe(400);
    expect(reply.json).toMatchObject({
      code: 'AUTH_SENHA_IGUAL_ATUAL',
      fields: { novaSenha: 'A nova senha precisa ser diferente da atual.' },
    });
  });

  it.each([
    ['7 caracteres', '1234567'],
    ['73 bytes', `${'á'.repeat(36)}x`],
  ])('novaSenha de %s → 400 VALIDACAO com fields.novaSenha (CA-54)', async (_nome, novaSenha) => {
    const { access } = await registerAna();

    const reply = await troca(access, { senhaAtual: 'segredo-forte', novaSenha });

    expect(reply.status).toBe(400);
    expect(reply.json).toMatchObject({
      code: 'VALIDACAO',
      fields: { novaSenha: expect.any(String) },
    });
  });

  it('sem token → 401 AUTH_NAO_AUTENTICADO, sem tocar em nada (CA-54)', async () => {
    await registerAna();

    const reply = await troca(undefined, {
      senhaAtual: 'segredo-forte',
      novaSenha: 'outra-senha-boa',
    });

    expect(reply.status).toBe(401);
    expect(reply.json).toMatchObject({ code: 'AUTH_NAO_AUTENTICADO' });
    expect(db.users[0]?.senhaHash).toBe('fake$segredo-forte');
  });

  it('a 6ª troca (certa ou errada) no mesmo IP → 429 LIMITE_TENTATIVAS com Retry-After (CA-55)', async () => {
    const { access } = await registerAna();
    const statuses: number[] = [];
    let sexta: Reply | undefined;
    for (let i = 0; i < 6; i += 1) {
      sexta = await troca(access, { senhaAtual: 'errada-mesmo', novaSenha: 'outra-senha-boa' });
      statuses.push(sexta.status);
    }

    expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
    expect(sexta?.json).toMatchObject({ statusCode: 429, code: 'LIMITE_TENTATIVAS' });
    expect(Number(sexta?.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('a janela do limite é de 15 minutos, com 5 trocas (CA-55)', () => {
    expect(PASSWORD_CHANGE_LIMIT).toEqual({ limit: 5, ttl: 15 * 60 * 1000 });
  });

  it('nenhuma senha vai para o corpo nem para o log', async () => {
    const { access } = await registerAna();
    await troca(access, { senhaAtual: 'segredo-forte', novaSenha: 'outra-senha-boa' });
    await troca(access, { senhaAtual: 'errada-mesmo', novaSenha: 'mais-uma-senha' });

    for (const proibido of [
      'segredo-forte',
      'outra-senha-boa',
      'errada-mesmo',
      'mais-uma-senha',
      'fake$',
    ]) {
      expect(bodies.join('\n')).not.toContain(proibido);
      expect(logger.lines.join('\n')).not.toContain(proibido);
    }
  });
});

describe('sessões ativas: GET/DELETE /auth/sessoes (perfil CA-08 a CA-11)', () => {
  const LOGIN = { email: ANA.email, senha: ANA.senha };

  /** Ana em três jars (A = registro, B e C = logins) e Bia em outro; devolve tokens e cookies. */
  async function tresJarsDaAna() {
    const a = await registerAna();
    const login = async () => {
      const reply = await call('POST', '/auth/login', { body: LOGIN });
      return {
        access: (reply.json as { accessToken: string }).accessToken,
        refresh: cookieValue(reply),
      };
    };
    const b = await login();
    const c = await login();
    const bia = await call('POST', '/auth/registro', {
      body: { nome: 'Bia', email: 'bia@exemplo.com', senha: 'segredo-da-bia' },
    });
    return {
      a: { access: a.access, refresh: a.refresh },
      b,
      c,
      bia: { access: (bia.json as { accessToken: string }).accessToken },
    };
  }

  async function idsDe(access: string): Promise<{ id: string; atual: boolean }[]> {
    const reply = await call('GET', '/auth/sessoes', { bearer: access });
    return reply.json as unknown as { id: string; atual: boolean }[];
  }

  it('as três rotas sem token → 401 AUTH_NAO_AUTENTICADO', async () => {
    for (const [method, path] of [
      ['GET', '/auth/sessoes'],
      ['DELETE', '/auth/sessoes'],
      ['DELETE', '/auth/sessoes/3f2b8a52-9c1e-4d6a-8f31-0a7e5b2c9d44'],
    ] as const) {
      const reply = await call(method, path);
      expect([method, path, reply.status]).toEqual([method, path, 401]);
      expect(reply.json).toMatchObject({ code: 'AUTH_NAO_AUTENTICADO' });
    }
  });

  it('GET: 200 com as 3 sessões da Ana (nenhuma da Bia), a atual primeiro e as chaves EXATAS (CA-08)', async () => {
    const { a } = await tresJarsDaAna();

    const reply = await call('GET', '/auth/sessoes', { bearer: a.access });

    expect(reply.status).toBe(200);
    const lista = reply.json as unknown as Record<string, unknown>[];
    expect(lista).toHaveLength(3);
    expect(lista.map((s) => s.atual)).toEqual([true, false, false]);
    for (const sessao of lista) {
      expect(Object.keys(sessao).sort()).toEqual([
        'atual',
        'criadoEm',
        'dispositivo',
        'id',
        'ultimoUsoEm',
      ]);
    }
    expect(reply.text).not.toMatch(/tokenHash|hashAnterior|expiraEm|userId/);
    expect(reply.text).not.toContain(a.refresh);
  });

  it('DELETE /:id de B pelo A: 204 sem corpo; o access de B cai NA HORA e o refresh de B também (CA-09)', async () => {
    const { a, b } = await tresJarsDaAna();
    const [, ...outras] = await idsDe(a.access);
    const idDeB = (await idsDe(b.access)).find((s) => s.atual)?.id as string;
    expect(outras.map((s) => s.id)).toContain(idDeB);

    const reply = await call('DELETE', `/auth/sessoes/${idDeB}`, { bearer: a.access });

    expect(reply.status).toBe(204);
    expect(reply.text).toBe('');
    const meB = await call('GET', '/auth/me', { bearer: b.access });
    expect(meB.status).toBe(401);
    expect(meB.json).toMatchObject({ code: 'AUTH_SESSAO_ENCERRADA' });
    const refreshB = await call('POST', '/auth/refresh', { cookie: b.refresh, csrf: true });
    expect(refreshB.status).toBe(401);
    expect((await call('GET', '/auth/me', { bearer: a.access })).status).toBe(200);
  });

  it('DELETE da própria sessão → 400 SESSAO_ATUAL; `abc` → 400 VALIDACAO; da Bia → 404 SESSAO_NAO_ENCONTRADA (CA-10)', async () => {
    const { a, bia } = await tresJarsDaAna();
    const idDeA = (await idsDe(a.access)).find((s) => s.atual)?.id as string;
    const idDaBia = (await idsDe(bia.access))[0]?.id as string;

    const propria = await call('DELETE', `/auth/sessoes/${idDeA}`, { bearer: a.access });
    const malformado = await call('DELETE', '/auth/sessoes/abc', { bearer: a.access });
    const daBia = await call('DELETE', `/auth/sessoes/${idDaBia}`, { bearer: a.access });
    const inexistente = await call('DELETE', '/auth/sessoes/00000000-0000-4000-8000-000000000000', {
      bearer: a.access,
    });

    expect(propria.status).toBe(400);
    expect(propria.json).toMatchObject({ code: 'SESSAO_ATUAL' });
    expect(malformado.status).toBe(400);
    expect(malformado.json).toMatchObject({ code: 'VALIDACAO' });
    expect(daBia.status).toBe(404);
    expect(daBia.json).toMatchObject({ code: 'SESSAO_NAO_ENCONTRADA' });
    // Inexistente e alheia: corpo idêntico (não revela que o id existe).
    expect(inexistente.text).toBe(daBia.text);
    expect((await call('GET', '/auth/me', { bearer: bia.access })).status).toBe(200);
    expect((await call('GET', '/auth/me', { bearer: a.access })).status).toBe(200);
  });

  it('DELETE /sessoes: 200 {"encerradas":2}; B e C caem; repetir dá {"encerradas":0} (CA-11)', async () => {
    const { a, b, c, bia } = await tresJarsDaAna();

    const reply = await call('DELETE', '/auth/sessoes', { bearer: a.access });

    expect(reply.status).toBe(200);
    expect(reply.json).toEqual({ encerradas: 2 });
    expect((await call('GET', '/auth/me', { bearer: b.access })).status).toBe(401);
    expect((await call('GET', '/auth/me', { bearer: c.access })).status).toBe(401);
    expect((await call('GET', '/auth/me', { bearer: a.access })).status).toBe(200);
    expect((await call('GET', '/auth/me', { bearer: bia.access })).status).toBe(200);
    expect((await idsDe(a.access)).map((s) => s.atual)).toEqual([true]);

    const deNovo = await call('DELETE', '/auth/sessoes', { bearer: a.access });
    expect(deNovo.json).toEqual({ encerradas: 0 });
  });

  it('nenhum token, cookie ou senha vai para o log nessas rotas', async () => {
    const { a, b } = await tresJarsDaAna();
    const idDeB = (await idsDe(b.access)).find((s) => s.atual)?.id as string;
    await call('GET', '/auth/sessoes', { bearer: a.access });
    await call('DELETE', `/auth/sessoes/${idDeB}`, { bearer: a.access });
    await call('DELETE', '/auth/sessoes', { bearer: a.access });

    const logs = logger.lines.join('\n');
    for (const segredo of [a.access, a.refresh, b.access, b.refresh, ANA.senha]) {
      expect(logs).not.toContain(segredo);
    }
  });
});
