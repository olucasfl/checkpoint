import { type ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../../common/decorators/public.decorator';
import { type RequestWithUser } from '../../common/decorators/current-user.decorator';
import { type PrismaService } from '../../database/prisma.service';
import { VinculoStateService } from '../integrations/vinculo/vinculo-state.service';
import { AccessTokenGuard } from './access-token.guard';
import { AuthTokensService } from './auth-tokens.service';
import { TOKEN_ISSUER } from './auth.constants';

// Valores sintéticos e óbvios (RULES.md §8).
const ACCESS_SECRET = 'segredo-de-acesso-sintetico-com-mais-de-32-caracteres';
const REFRESH_SECRET = 'segredo-de-refresh-sintetico-com-mais-de-32-caracteres';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);

const config = {
  get: (key: string) =>
    ({ JWT_ACCESS_SECRET: ACCESS_SECRET, JWT_REFRESH_SECRET: REFRESH_SECRET })[key],
} as unknown as ConfigService<never, true>;

const jwt = new JwtService({});
const tokens = new AuthTokensService(jwt, config as never);

const refreshSession = { findUnique: jest.fn() };
const prisma = { refreshSession } as unknown as PrismaService;
const guard = new AccessTokenGuard(new Reflector(), tokens, prisma);

class ProtectedController {
  handler(): void {}
}

class PublicController {
  @Public()
  handler(): void {}
}

function contextFor(
  controller: new () => { handler(): void },
  authorization?: string,
): { context: ExecutionContext; request: RequestWithUser } {
  const request = { headers: { authorization } } as unknown as RequestWithUser;
  const context = {
    getHandler: () => controller.prototype.handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(401);
    return ((error as HttpException).getResponse() as { code?: string }).code;
  }
  throw new Error('esperava um 401');
}

const liveSession = { userId: USER_ID, expiraEm: new Date(NOW + 60_000) };

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  refreshSession.findUnique.mockReset();
  refreshSession.findUnique.mockResolvedValue(liveSession);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AccessTokenGuard — @Public', () => {
  it('uma rota @Public() passa sem token e sem tocar no banco (CA-17)', async () => {
    const { context } = contextFor(PublicController);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(refreshSession.findUnique).not.toHaveBeenCalled();
  });

  it('sem @Public() a rota é fechada: sem cabeçalho → AUTH_NAO_AUTENTICADO', async () => {
    const { context } = contextFor(ProtectedController);

    await expect(codeOf(guard.canActivate(context))).resolves.toBe('AUTH_NAO_AUTENTICADO');
  });
});

describe('AccessTokenGuard — token inválido → AUTH_NAO_AUTENTICADO (CA-07)', () => {
  it.each([
    ['cabeçalho que não é Bearer', 'Basic dXNlcjpzZW5oYQ=='],
    ['Bearer sem token', 'Bearer '],
    ['token que não é um JWT', 'Bearer isto-nao-e-um-jwt'],
  ])('%s', async (_nome, authorization) => {
    const { context } = contextFor(ProtectedController, authorization);

    await expect(codeOf(guard.canActivate(context))).resolves.toBe('AUTH_NAO_AUTENTICADO');
  });

  it('access token alterado num caractere', async () => {
    const token = await tokens.signAccess(USER_ID, SESSION_ID);
    // Troca o penúltimo caractere por um DIFERENTE dele (decidir pelo último deixava o token igual quando
    // o penúltimo já era 'A' ou 'B': o teste passava a falhar de vez em quando, com um token ainda válido).
    const posicao = token.length - 2;
    const alterado =
      token.slice(0, posicao) + (token[posicao] === 'A' ? 'B' : 'A') + token.slice(posicao + 1);
    const { context } = contextFor(ProtectedController, `Bearer ${alterado}`);

    await expect(codeOf(guard.canActivate(context))).resolves.toBe('AUTH_NAO_AUTENTICADO');
  });

  it('um REFRESH token apresentado como access (segredos separados)', async () => {
    const refresh = await tokens.signRefresh(USER_ID, SESSION_ID);
    const { context } = contextFor(ProtectedController, `Bearer ${refresh}`);

    await expect(codeOf(guard.canActivate(context))).resolves.toBe('AUTH_NAO_AUTENTICADO');
    expect(refreshSession.findUnique).not.toHaveBeenCalled();
  });

  it('token com typ "refresh" ASSINADO com o segredo do access (typ trocado)', async () => {
    const trocado = await jwt.signAsync(
      { sub: USER_ID, sid: SESSION_ID, typ: 'refresh' },
      { secret: ACCESS_SECRET, expiresIn: 60, issuer: TOKEN_ISSUER },
    );
    const { context } = contextFor(ProtectedController, `Bearer ${trocado}`);

    await expect(codeOf(guard.canActivate(context))).resolves.toBe('AUTH_NAO_AUTENTICADO');
  });

  it('token assinado por outro emissor', async () => {
    const outro = await jwt.signAsync(
      { sub: USER_ID, sid: SESSION_ID, typ: 'access' },
      { secret: ACCESS_SECRET, expiresIn: 60, issuer: 'outro-servico' },
    );
    const { context } = contextFor(ProtectedController, `Bearer ${outro}`);

    await expect(codeOf(guard.canActivate(context))).resolves.toBe('AUTH_NAO_AUTENTICADO');
  });

  it('token sem assinatura (alg none)', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: USER_ID, sid: SESSION_ID, typ: 'access', iss: TOKEN_ISSUER }),
    ).toString('base64url');
    const { context } = contextFor(ProtectedController, `Bearer ${header}.${payload}.`);

    await expect(codeOf(guard.canActivate(context))).resolves.toBe('AUTH_NAO_AUTENTICADO');
  });
});

describe('AccessTokenGuard — vencimento (CA-08, relógio falso)', () => {
  it('access token válido passa; 16 minutos depois é AUTH_TOKEN_EXPIRADO', async () => {
    const token = await tokens.signAccess(USER_ID, SESSION_ID);
    const { context } = contextFor(ProtectedController, `Bearer ${token}`);
    await expect(guard.canActivate(context)).resolves.toBe(true);

    jest.spyOn(Date, 'now').mockReturnValue(NOW + 16 * 60 * 1000);
    refreshSession.findUnique.mockResolvedValue({
      userId: USER_ID,
      expiraEm: new Date(NOW + 60 * 60 * 1000),
    });

    await expect(codeOf(guard.canActivate(context))).resolves.toBe('AUTH_TOKEN_EXPIRADO');
  });

  it('14 minutos depois ainda vale (a validade é de 15)', async () => {
    const token = await tokens.signAccess(USER_ID, SESSION_ID);
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 14 * 60 * 1000);
    refreshSession.findUnique.mockResolvedValue({
      userId: USER_ID,
      expiraEm: new Date(NOW + 60 * 60 * 1000),
    });
    const { context } = contextFor(ProtectedController, `Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

describe('AccessTokenGuard — a sessão manda (encerramento imediato)', () => {
  it('token válido e sessão presente: anexa { id, sessionId } à request', async () => {
    const token = await tokens.signAccess(USER_ID, SESSION_ID);
    const { context, request } = contextFor(ProtectedController, `Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.user).toEqual({ id: USER_ID, sessionId: SESSION_ID });
    expect(refreshSession.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SESSION_ID } }),
    );
  });

  it('sessão apagada (logout, troca de senha, reuso): 401 AUTH_SESSAO_ENCERRADA NA HORA (CA-13)', async () => {
    const token = await tokens.signAccess(USER_ID, SESSION_ID);
    refreshSession.findUnique.mockResolvedValue(null);
    const { context } = contextFor(ProtectedController, `Bearer ${token}`);

    await expect(codeOf(guard.canActivate(context))).resolves.toBe('AUTH_SESSAO_ENCERRADA');
  });

  it('sessão que pertence a OUTRO usuário', async () => {
    const token = await tokens.signAccess(USER_ID, SESSION_ID);
    refreshSession.findUnique.mockResolvedValue({ ...liveSession, userId: 'outro-usuario' });
    const { context } = contextFor(ProtectedController, `Bearer ${token}`);

    await expect(codeOf(guard.canActivate(context))).resolves.toBe('AUTH_SESSAO_ENCERRADA');
  });

  it('sessão vencida (passou dos 30 dias sem uso)', async () => {
    const token = await tokens.signAccess(USER_ID, SESSION_ID);
    refreshSession.findUnique.mockResolvedValue({ ...liveSession, expiraEm: new Date(NOW - 1) });
    const { context } = contextFor(ProtectedController, `Bearer ${token}`);

    await expect(codeOf(guard.canActivate(context))).resolves.toBe('AUTH_SESSAO_ENCERRADA');
  });

  it('aceita "bearer" em minúsculas (o esquema não diferencia caixa)', async () => {
    const token = await tokens.signAccess(USER_ID, SESSION_ID);
    const { context } = contextFor(ProtectedController, `bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

// O `state` do vínculo reaproveita o `JWT_ACCESS_SECRET` (spec integracao-plataformas). Só é seguro se o
// guard global o RECUSAR como access token (CA-61); o outro sentido (o fluxo recusar um access token como
// `state`) está em `integrations/vinculo/vinculo-state.service.spec.ts` (CA-62).
describe('AccessTokenGuard — o state do vínculo não vale como access token (CA-61)', () => {
  const state = new VinculoStateService(jwt, config as never);

  it('um state real, com a assinatura certa, é recusado (401 AUTH_NAO_AUTENTICADO) e a sessão nem é consultada', async () => {
    const emitido = await state.emitir(USER_ID, 'STEAM');
    const { context } = contextFor(ProtectedController, `Bearer ${emitido.state}`);

    await expect(codeOf(guard.canActivate(context))).resolves.toBe('AUTH_NAO_AUTENTICADO');
    expect(refreshSession.findUnique).not.toHaveBeenCalled();
  });

  it('mesmo forjado com o emissor dos tokens de acesso, o typ "vinculo" é recusado', async () => {
    const forjado = await jwt.signAsync(
      { sub: USER_ID, sid: SESSION_ID, typ: 'vinculo', prov: 'STEAM', nonce: 'n' },
      { secret: ACCESS_SECRET, issuer: TOKEN_ISSUER, expiresIn: 600, algorithm: 'HS256' },
    );
    const { context } = contextFor(ProtectedController, `Bearer ${forjado}`);

    await expect(codeOf(guard.canActivate(context))).resolves.toBe('AUTH_NAO_AUTENTICADO');
    expect(refreshSession.findUnique).not.toHaveBeenCalled();
  });
});
