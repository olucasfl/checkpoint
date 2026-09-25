import { Controller, Get, type INestApplication, type LoggerService } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { type AddressInfo } from 'node:net';
import { createValidationPipe } from '../../../common/pipes/app-validation.pipe';
import { API_GLOBAL_PREFIX } from '../../../config/app.config';
import { PrismaService } from '../../../database/prisma.service';
import { AccessTokenGuard } from '../../auth/access-token.guard';
import { AuthTokensService } from '../../auth/auth-tokens.service';
import { IntegrationsController } from '../integrations.controller';
import { IntegrationsService } from '../integrations.service';
import { IntegrationsThrottlerGuard } from '../integrations-throttler.guard';
import { GAME_PROVIDERS, ProviderRegistry } from '../providers/provider-registry';
import { SteamOpenId } from '../steam/steam-open-id';
import { SteamProvider } from '../steam/steam.provider';
import { SteamClient } from '../steam/steam.client';
import { VinculoStateService } from '../vinculo/vinculo-state.service';

export const ANA_ID = '0b6c1f7e-2a3d-4e5f-8a9b-1c2d3e4f5a6b';
export const BIA_ID = '9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c6b';

export const ENV = {
  NODE_ENV: 'development',
  JWT_ACCESS_SECRET: 'segredo-de-acesso-sintetico-com-mais-de-32-caracteres',
  JWT_REFRESH_SECRET: 'segredo-de-refresh-sintetico-com-mais-de-32-caracteres',
  API_PUBLIC_URL: 'http://localhost:3333',
  WEB_PUBLIC_URL: 'http://localhost:5173',
  STEAM_API_KEY: 'ABCDEF0123456789ABCDEF0123456789',
};

export interface ContaRow {
  id: string;
  userId: string;
  provedor: 'STEAM';
  idExterno: string;
  nomeExibicao: string;
  vinculadaEm: Date;
}

export interface GameRow {
  id: string;
  userId: string;
  titulo: string;
  /** `""` = sem plataforma, como no banco. */
  plataforma: string;
}

export interface JogoPlataformaRow {
  id: string;
  userId: string;
  gameId?: string;
  provedor: 'STEAM';
  idExterno: string;
  conquistasTotal: number | null;
  conquistasDesbloqueadas: number | null;
}

/**
 * O Prisma em memória só do que as rotas de integração usam, com a unicidade `(userId, provedor)` da migration
 * (o `create` repetido lança `P2002`, como o banco). Sessões de mentira para o guard global.
 */
export class FakeIntegrationsPrisma {
  contas: ContaRow[] = [];
  jogos: JogoPlataformaRow[] = [];
  games: GameRow[] = [];
  sessions = new Map<string, string>();

  refreshSession = {
    findUnique: ({ where }: { where: { id: string } }) => {
      const userId = this.sessions.get(where.id);
      return Promise.resolve(
        userId ? { userId, expiraEm: new Date(Date.now() + 60 * 60 * 1000) } : null,
      );
    },
  };

  contaVinculada = {
    findUnique: ({
      where,
    }: {
      where: { userId_provedor: { userId: string; provedor: string } };
    }) => {
      const { userId, provedor } = where.userId_provedor;
      const conta = this.contas.find((c) => c.userId === userId && c.provedor === provedor);
      return Promise.resolve(conta ? { ...conta } : null);
    },
    findMany: ({ where }: { where: { userId: string } }) =>
      Promise.resolve(this.contas.filter((c) => c.userId === where.userId).map((c) => ({ ...c }))),
    create: ({ data }: { data: Omit<ContaRow, 'id' | 'vinculadaEm'> }) => {
      if (this.contas.some((c) => c.userId === data.userId && c.provedor === data.provedor)) {
        return Promise.reject(Object.assign(new Error('unique'), { code: 'P2002' }));
      }
      const row: ContaRow = { ...data, id: randomUUID(), vinculadaEm: new Date() };
      this.contas.push(row);
      return Promise.resolve({ id: row.id });
    },
    update: ({
      where,
      data,
    }: {
      where: { userId_provedor: { userId: string; provedor: string } };
      data: { nomeExibicao: string };
    }) => {
      const { userId, provedor } = where.userId_provedor;
      const conta = this.contas.find((c) => c.userId === userId && c.provedor === provedor);
      if (!conta) {
        return Promise.reject(Object.assign(new Error('missing'), { code: 'P2025' }));
      }
      conta.nomeExibicao = data.nomeExibicao;
      return Promise.resolve({ id: conta.id });
    },
    deleteMany: ({ where }: { where: { userId: string; provedor: string } }) => {
      const antes = this.contas.length;
      this.contas = this.contas.filter(
        (c) => !(c.userId === where.userId && c.provedor === where.provedor),
      );
      return Promise.resolve({ count: antes - this.contas.length });
    },
  };

  game = {
    findMany: ({ where }: { where: { userId: string } }) =>
      Promise.resolve(this.games.filter((g) => g.userId === where.userId).map((g) => ({ ...g }))),
  };

  jogoPlataforma = {
    findMany: ({ where }: { where: { userId: string; provedor: string } }) =>
      Promise.resolve(
        this.jogos.filter((j) => j.userId === where.userId && j.provedor === where.provedor),
      ),
    deleteMany: ({ where }: { where: { userId: string; provedor: string } }) => {
      const antes = this.jogos.length;
      this.jogos = this.jogos.filter(
        (j) => !(j.userId === where.userId && j.provedor === where.provedor),
      );
      return Promise.resolve({ count: antes - this.jogos.length });
    },
  };

  $transaction = (operacoes: Promise<unknown>[]) => Promise.all(operacoes);
}

/** Uma rota protegida qualquer, para provar que o `state` não vale como access token (CA-61). */
@Controller('protegido')
class ProtectedStubController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

/** Guarda tudo o que a aplicação loga, para provar que nenhum segredo passa por ali (CA-58). */
export class CollectingLogger implements LoggerService {
  lines: string[] = [];
  log(message: unknown, ...rest: unknown[]): void {
    this.lines.push([message, ...rest].map(String).join(' '));
  }
  error(message: unknown, ...rest: unknown[]): void {
    this.lines.push([message, ...rest].map(String).join(' '));
  }
  warn(message: unknown, ...rest: unknown[]): void {
    this.lines.push([message, ...rest].map(String).join(' '));
  }
  debug(message: unknown, ...rest: unknown[]): void {
    this.lines.push([message, ...rest].map(String).join(' '));
  }
  verbose(message: unknown, ...rest: unknown[]): void {
    this.lines.push([message, ...rest].map(String).join(' '));
  }
}

export interface IntegrationsHttpApp {
  app: INestApplication;
  baseUrl: string;
  db: FakeIntegrationsPrisma;
  /** O `SteamClient` falso (só o que o provider usa). */
  client: { obterPerfil: jest.Mock; listarJogos: jest.Mock };
  /** O OpenID de verdade, com a chamada à Steam (`validarRetorno`) trocada por um mock. */
  openId: SteamOpenId & { validarRetorno: jest.Mock };
  logger: CollectingLogger;
  /** Access token válido de `userId`, com a sessão dele registrada. */
  tokenFor(userId: string): Promise<string>;
  /** Um access token assinado como o do usuário, para usar como `state` falso. */
  tokens: AuthTokensService;
}

/**
 * Sobe o módulo de integrações de verdade (controller, service, `SteamProvider`, `VinculoStateService`, guard
 * global, limite por usuário, pipe global e cookie-parser) numa porta local. Só a Steam (cliente e
 * confirmação do OpenID) e o banco são falsos: nenhum teste toca a rede nem o Postgres.
 */
export async function startIntegrationsApp(
  env: Record<string, unknown> = ENV,
): Promise<IntegrationsHttpApp> {
  const db = new FakeIntegrationsPrisma();
  const logger = new CollectingLogger();
  const client = { obterPerfil: jest.fn(), listarJogos: jest.fn() };
  const openId = Object.assign(new SteamOpenId(), { validarRetorno: jest.fn() });

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }),
      JwtModule.register({}),
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    ],
    controllers: [IntegrationsController, ProtectedStubController],
    providers: [
      IntegrationsService,
      IntegrationsThrottlerGuard,
      VinculoStateService,
      AuthTokensService,
      SteamProvider,
      { provide: SteamOpenId, useValue: openId },
      { provide: SteamClient, useValue: client },
      {
        provide: GAME_PROVIDERS,
        useFactory: (steam: SteamProvider) => [steam],
        inject: [SteamProvider],
      },
      ProviderRegistry,
      { provide: PrismaService, useValue: db },
      { provide: APP_GUARD, useClass: AccessTokenGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication({ logger });
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.use(cookieParser());
  app.useGlobalPipes(createValidationPipe());
  await app.listen(0, '127.0.0.1');

  const { port } = app.getHttpServer().address() as AddressInfo;
  const tokens = moduleRef.get(AuthTokensService);

  return {
    app,
    baseUrl: `http://127.0.0.1:${port}/${API_GLOBAL_PREFIX}`,
    db,
    client,
    openId: openId as IntegrationsHttpApp['openId'],
    logger,
    tokens,
    tokenFor: (userId) => {
      const sessionId = randomUUID();
      db.sessions.set(sessionId, userId);
      return tokens.signAccess(userId, sessionId);
    },
  };
}
