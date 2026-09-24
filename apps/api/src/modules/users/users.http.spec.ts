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
import { UsersController } from './users.controller';
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
}

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
