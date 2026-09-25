import { type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { type AddressInfo } from 'node:net';
import { createValidationPipe } from '../../common/pipes/app-validation.pipe';
import { API_GLOBAL_PREFIX } from '../../config/app.config';
import { PrismaService } from '../../database/prisma.service';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { AuthThrottlerGuard } from '../auth/auth-throttler.guard';
import { AuthTokensService } from '../auth/auth-tokens.service';
import { CsrfHeaderGuard } from '../auth/csrf-header.guard';
import { FIELD_MESSAGES } from '../auth/dto/field-rules';
import { PasswordHasher } from '../auth/password-hasher';
import { FakeAuthPrisma, fakeHasher } from '../auth/testing/fake-auth-prisma';
import { StorageService } from '../games/cover/storage.service';
import { GamesService } from '../games/games.service';
import { EXCLUSAO_CONTA_LIMIT, UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * `PATCH /api/users/me` por HTTP, com o guard global, o pipe do `main.ts` e a auth de verdade (o
 * token vem de um registro real). Prisma em memória: nenhum teste toca o banco.
 */
const ENV = {
  NODE_ENV: 'development',
  JWT_ACCESS_SECRET: 'segredo-de-acesso-sintetico-com-mais-de-32-caracteres',
  JWT_REFRESH_SECRET: 'segredo-de-refresh-sintetico-com-mais-de-32-caracteres',
  AUTH_REGISTRATION_OPEN: true,
};

let app: INestApplication;
let baseUrl: string;
let db: FakeAuthPrisma;

interface Reply {
  status: number;
  json: Record<string, unknown> | undefined;
  setCookies: string[];
}

/** O bucket, mockado: nenhum teste fala com o Supabase. */
const storage = { upload: jest.fn(), remove: jest.fn(), publicUrl: jest.fn() };

async function call(
  method: string,
  path: string,
  options: { body?: unknown; bearer?: string } = {},
): Promise<Reply> {
  const headers: Record<string, string> = { 'user-agent': 'curl/8.5.0' };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (options.bearer) {
    headers.authorization = `Bearer ${options.bearer}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return {
    status: response.status,
    json: text ? (JSON.parse(text) as Record<string, unknown>) : undefined,
    setCookies: response.headers.getSetCookie(),
  };
}

async function registerAna(): Promise<string> {
  const reply = await call('POST', '/auth/registro', {
    body: { nome: 'Ana Teste', email: 'ana@exemplo.com', senha: 'segredo-forte' },
  });
  return (reply.json as { accessToken: string }).accessToken;
}

beforeEach(async () => {
  db = new FakeAuthPrisma();
  Object.values(storage).forEach((fn) => fn.mockReset());
  storage.remove.mockResolvedValue(undefined);
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ENV] }),
      JwtModule.register({}),
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    ],
    controllers: [AuthController, UsersController],
    providers: [
      AuthService,
      AuthTokensService,
      AuthThrottlerGuard,
      CsrfHeaderGuard,
      UsersService,
      GamesService,
      { provide: StorageService, useValue: storage },
      { provide: PasswordHasher, useValue: fakeHasher },
      { provide: PrismaService, useValue: db },
      { provide: APP_GUARD, useClass: AccessTokenGuard },
    ],
  }).compile();

  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.use(cookieParser());
  app.useGlobalPipes(createValidationPipe());
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/${API_GLOBAL_PREFIX}`;
});

afterEach(async () => {
  await app.close();
});

describe('PATCH /api/users/me (perfil CA-02, CA-03)', () => {
  it('200 com o Usuario, nome aparado e o mesmo e-mail; o /auth/me passa a devolver o nome novo (CA-02)', async () => {
    const token = await registerAna();

    const reply = await call('PATCH', '/users/me', {
      bearer: token,
      body: { nome: '  Ana Souza ' },
    });

    expect(reply.status).toBe(200);
    expect(reply.json).toEqual({
      id: expect.any(String),
      nome: 'Ana Souza',
      email: 'ana@exemplo.com',
      criadoEm: expect.any(String),
    });
    const me = await call('GET', '/auth/me', { bearer: token });
    expect(me.json).toMatchObject({ nome: 'Ana Souza' });
  });

  it('a resposta nunca traz senhaHash nem qualquer campo fora do contrato', async () => {
    const token = await registerAna();

    const reply = await call('PATCH', '/users/me', { bearer: token, body: { nome: 'Ana' } });

    expect(Object.keys(reply.json ?? {}).sort()).toEqual(['criadoEm', 'email', 'id', 'nome']);
  });

  it.each([
    ['nome vazio', { nome: '' }, FIELD_MESSAGES.nomeVazio],
    ['nome de 61 caracteres', { nome: 'a'.repeat(61) }, FIELD_MESSAGES.nomeLongo],
    ['corpo vazio {}', {}, FIELD_MESSAGES.nomeVazio],
  ])('400 VALIDACAO com fields.nome: %s, e nada muda (CA-03)', async (_caso, body, message) => {
    const token = await registerAna();

    const reply = await call('PATCH', '/users/me', { bearer: token, body });

    expect(reply.status).toBe(400);
    expect(reply.json).toMatchObject({ code: 'VALIDACAO', fields: { nome: message } });
    expect(db.users[0]?.nome).toBe('Ana Teste');
  });

  it('`email` no corpo é campo desconhecido: 400 VALIDACAO e o e-mail não muda (CA-03)', async () => {
    const token = await registerAna();

    const reply = await call('PATCH', '/users/me', {
      bearer: token,
      body: { email: 'outro@exemplo.com' },
    });

    expect(reply.status).toBe(400);
    expect(reply.json).toMatchObject({ code: 'VALIDACAO' });
    expect(db.users[0]?.email).toBe('ana@exemplo.com');
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('sem token → 401 AUTH_NAO_AUTENTICADO, sem tocar no banco (CA-03)', async () => {
    await registerAna();

    const reply = await call('PATCH', '/users/me', { body: { nome: 'Invasor' } });

    expect(reply.status).toBe(401);
    expect(reply.json).toMatchObject({ code: 'AUTH_NAO_AUTENTICADO' });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.users[0]?.nome).toBe('Ana Teste');
  });

  it('sessão encerrada (logout em outro lugar) → 401 AUTH_SESSAO_ENCERRADA na hora', async () => {
    const token = await registerAna();
    db.sessions.length = 0;

    const reply = await call('PATCH', '/users/me', { bearer: token, body: { nome: 'Ana' } });

    expect(reply.status).toBe(401);
    expect(reply.json).toMatchObject({ code: 'AUTH_SESSAO_ENCERRADA' });
  });
});

describe('POST /api/users/me/exclusao (perfil CA-24, CA-25, CA-29)', () => {
  const excluir = (bearer: string | undefined, body: unknown) =>
    call('POST', '/users/me/exclusao', { bearer, body });

  it('204 sem corpo, cookie do refresh limpo (Max-Age=0, mesmo Path), e conta, jogos e sessões somem (CA-24)', async () => {
    const token = await registerAna();
    const anaId = db.users[0]?.id as string;
    db.games.push(
      { userId: anaId, capaPath: `${anaId}/g1/nova.png` },
      { userId: anaId, capaPath: 'g2/antiga.webp' },
      { userId: anaId, capaPath: null },
    );

    const reply = await excluir(token, { senha: 'segredo-forte' });

    expect(reply.status).toBe(204);
    expect(reply.json).toBeUndefined();
    const cookie = reply.setCookies.find((c) => c.startsWith('checkpoint_refresh='));
    expect(cookie).toMatch(/^checkpoint_refresh=;/);
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(db.users).toHaveLength(0);
    expect(db.sessions).toHaveLength(0);
    expect(db.games).toHaveLength(0);
    expect(storage.remove.mock.calls).toEqual([[`${anaId}/g1/nova.png`], ['g2/antiga.webp']]);
  });

  it('depois, o mesmo token já não vale e o e-mail pode ser registrado de novo', async () => {
    const token = await registerAna();
    await excluir(token, { senha: 'segredo-forte' });

    const me = await call('GET', '/auth/me', { bearer: token });
    const login = await call('POST', '/auth/login', {
      body: { email: 'ana@exemplo.com', senha: 'segredo-forte' },
    });
    const denovo = await call('POST', '/auth/registro', {
      body: { nome: 'Ana Teste', email: 'ana@exemplo.com', senha: 'segredo-forte' },
    });
    expect(me.status).toBe(401);
    expect(login.json).toMatchObject({ code: 'AUTH_CREDENCIAIS_INVALIDAS' });
    expect(denovo.status).toBe(201);
  });

  it('senha errada → 400 AUTH_SENHA_ATUAL_INCORRETA com fields.senha e nada é apagado (CA-25)', async () => {
    const token = await registerAna();

    const reply = await excluir(token, { senha: 'nao-e-esta' });

    expect(reply.status).toBe(400);
    expect(reply.json).toMatchObject({
      code: 'AUTH_SENHA_ATUAL_INCORRETA',
      fields: { senha: 'Senha atual incorreta.' },
    });
    expect(reply.setCookies).toEqual([]);
    expect(db.users).toHaveLength(1);
    expect(db.sessions).toHaveLength(1);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('senha vazia → 400 VALIDACAO com fields.senha', async () => {
    const token = await registerAna();

    const reply = await excluir(token, { senha: '' });

    expect(reply.status).toBe(400);
    expect(reply.json).toMatchObject({
      code: 'VALIDACAO',
      fields: { senha: FIELD_MESSAGES.senhaLoginVazia },
    });
    expect(db.users).toHaveLength(1);
  });

  it('sem token → 401 AUTH_NAO_AUTENTICADO, sem tocar no banco', async () => {
    await registerAna();

    const reply = await excluir(undefined, { senha: 'segredo-forte' });

    expect(reply.status).toBe(401);
    expect(reply.json).toMatchObject({ code: 'AUTH_NAO_AUTENTICADO' });
    expect(db.users).toHaveLength(1);
  });

  it('storage falhando: 204 mesmo assim, e a conta some (CA-26)', async () => {
    const token = await registerAna();
    const anaId = db.users[0]?.id as string;
    db.games.push({ userId: anaId, capaPath: `${anaId}/g1/nova.png` });
    storage.remove.mockRejectedValue(new Error('storage fora do ar'));

    const reply = await excluir(token, { senha: 'segredo-forte' });

    expect(reply.status).toBe(204);
    expect(db.users).toHaveLength(0);
  });

  it('o 6º pedido em 15 min → 429 LIMITE_TENTATIVAS com Retry-After (CA-29)', async () => {
    const token = await registerAna();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await excluir(token, { senha: 'errada-mesmo' })).status);
    }

    expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
    expect(db.users).toHaveLength(1);
  });

  it('contador próprio: 5 trocas de senha erradas não gastam a cota da exclusão, e vice-versa', async () => {
    const token = await registerAna();
    const trocas: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      trocas.push(
        (
          await call('PUT', '/auth/senha', {
            bearer: token,
            body: { senhaAtual: 'errada-mesmo', novaSenha: 'outra-senha-boa' },
          })
        ).status,
      );
    }
    const exclusoes: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      exclusoes.push((await excluir(token, { senha: 'errada-mesmo' })).status);
    }

    expect(trocas).toEqual([400, 400, 400, 400, 400]);
    // Se a cota fosse dividida, a 1ª exclusão já seria 429.
    expect(exclusoes).toEqual([400, 400, 400, 400, 400]);
    expect((await excluir(token, { senha: 'errada-mesmo' })).status).toBe(429);
  });

  it('o limite é o da spec: 5 a cada 15 minutos', () => {
    expect(EXCLUSAO_CONTA_LIMIT).toEqual({ limit: 5, ttl: 15 * 60 * 1000 });
  });
});
