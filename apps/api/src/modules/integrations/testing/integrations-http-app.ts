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
import { CifraDeCredencial } from '../psn/cifra-de-credencial';
import { PsnSessao } from '../psn/psn-sessao';
import { PsnClient } from '../psn/psn.client';
import { PsnProvider } from '../psn/psn.provider';
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
  // A chave de cifra de teste: 64 hexadecimais sintéticos e óbvios (RULES.md §8).
  PSN_TOKEN_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
};

export interface ContaRow {
  id: string;
  userId: string;
  provedor: 'STEAM' | 'PLAYSTATION';
  idExterno: string;
  nomeExibicao: string;
  vinculadaEm: Date;
  reautenticarDesde?: Date | null;
}

export interface CredencialRow {
  id: string;
  contaId: string;
  refreshCifrado: string;
  expiraEm: Date;
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
  provedor: 'STEAM' | 'PLAYSTATION';
  idExterno: string;
  minutosJogados?: number;
  ultimaVezJogadoEm?: Date | null;
  conquistasTotal: number | null;
  conquistasDesbloqueadas: number | null;
  capaUrl?: string | null;
  atualizadoEm?: Date;
}

/**
 * O Prisma em memória só do que as rotas de integração usam, com a unicidade `(userId, provedor)` da migration
 * (o `create` repetido lança `P2002`, como o banco). Sessões de mentira para o guard global.
 */
export class FakeIntegrationsPrisma {
  contas: ContaRow[] = [];
  credenciais: CredencialRow[] = [];
  jogos: JogoPlataformaRow[] = [];
  games: GameRow[] = [];
  /** Um retrato de `jogos` ANTES de cada escrita: é o que a transação usa para desfazer (rollback). */
  private historico: JogoPlataformaRow[][] = [];
  /** Quantas escritas em `JogoPlataforma` já houve (para provar "não grava duas vezes"). */
  get escritas(): number {
    return this.historico.length;
  }

  private registrar(): void {
    this.historico.push(this.jogos.map((j) => ({ ...j })));
  }
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
      return Promise.resolve(conta ? this.contaCompleta(conta) : null);
    },
    findMany: ({ where }: { where: { userId: string } }) =>
      Promise.resolve(
        this.contas.filter((c) => c.userId === where.userId).map((c) => this.contaCompleta(c)),
      ),
    create: ({
      data,
    }: {
      data: Omit<ContaRow, 'id' | 'vinculadaEm'> & {
        id?: string;
        credencial?: { create: { refreshCifrado: string; expiraEm: Date } };
      };
    }) => {
      if (this.contas.some((c) => c.userId === data.userId && c.provedor === data.provedor)) {
        return Promise.reject(Object.assign(new Error('unique'), { code: 'P2002' }));
      }
      const { credencial, ...resto } = data;
      const row: ContaRow = { ...resto, id: data.id ?? randomUUID(), vinculadaEm: new Date() };
      this.contas.push(row);
      if (credencial) {
        this.credenciais.push({ id: randomUUID(), contaId: row.id, ...credencial.create });
      }
      return Promise.resolve(this.contaCompleta(row));
    },
    update: ({
      where,
      data,
    }: {
      where: { userId_provedor?: { userId: string; provedor: string }; id?: string };
      data: { nomeExibicao?: string; reautenticarDesde?: Date | null };
    }) => {
      const conta = where.id
        ? this.contas.find((c) => c.id === where.id)
        : this.contas.find(
            (c) =>
              c.userId === where.userId_provedor?.userId &&
              c.provedor === where.userId_provedor.provedor,
          );
      if (!conta) {
        return Promise.reject(Object.assign(new Error('missing'), { code: 'P2025' }));
      }
      Object.assign(conta, data);
      return Promise.resolve(this.contaCompleta(conta));
    },
    updateMany: ({
      where,
      data,
    }: {
      where: { userId: string; provedor: string; reautenticarDesde: null };
      data: { reautenticarDesde: Date };
    }) => {
      const alvo = this.contas.filter(
        (c) =>
          c.userId === where.userId &&
          c.provedor === where.provedor &&
          (c.reautenticarDesde ?? null) === null,
      );
      alvo.forEach((c) => Object.assign(c, data));
      return Promise.resolve({ count: alvo.length });
    },
    deleteMany: ({ where }: { where: { userId: string; provedor: string } }) => {
      const removidas = this.contas.filter(
        (c) => c.userId === where.userId && c.provedor === where.provedor,
      );
      this.contas = this.contas.filter((c) => !removidas.includes(c));
      // `onDelete: Cascade`: a credencial some junto com a conta.
      this.credenciais = this.credenciais.filter((k) => !removidas.some((c) => c.id === k.contaId));
      return Promise.resolve({ count: removidas.length });
    },
  };

  credencialPlataforma = {
    findUnique: ({ where }: { where: { contaId: string } }) => {
      const achada = this.credenciais.find((k) => k.contaId === where.contaId);
      return Promise.resolve(achada ? { ...achada } : null);
    },
    update: ({ where, data }: { where: { contaId: string }; data: Partial<CredencialRow> }) => {
      const achada = this.credenciais.find((k) => k.contaId === where.contaId);
      if (!achada) {
        return Promise.reject(Object.assign(new Error('missing'), { code: 'P2025' }));
      }
      Object.assign(achada, data);
      return Promise.resolve({ id: achada.id });
    },
    upsert: ({
      where,
      create,
      update,
    }: {
      where: { contaId: string };
      create: Omit<CredencialRow, 'id'>;
      update: Partial<CredencialRow>;
    }) => {
      const achada = this.credenciais.find((k) => k.contaId === where.contaId);
      if (achada) {
        Object.assign(achada, update);
        return Promise.resolve({ id: achada.id });
      }
      const row = { id: randomUUID(), ...create };
      this.credenciais.push(row);
      return Promise.resolve({ id: row.id });
    },
  };

  private contaCompleta(c: ContaRow) {
    return { ...c, reautenticarDesde: c.reautenticarDesde ?? null };
  }

  game = {
    findFirst: ({ where }: { where: { id: string; userId: string } }) => {
      const jogo = this.games.find((g) => g.id === where.id && g.userId === where.userId);
      return Promise.resolve(jogo ? { ...jogo } : null);
    },
    findMany: ({ where }: { where: { userId: string } }) =>
      Promise.resolve(this.games.filter((g) => g.userId === where.userId).map((g) => ({ ...g }))),
  };

  /** Preenche o que as linhas de teste omitem, como o banco devolveria as colunas. */
  private completa(j: JogoPlataformaRow) {
    return {
      ...j,
      minutosJogados: j.minutosJogados ?? 0,
      ultimaVezJogadoEm: j.ultimaVezJogadoEm ?? null,
      capaUrl: j.capaUrl ?? null,
      atualizadoEm: j.atualizadoEm ?? new Date(0),
    };
  }

  jogoPlataforma = {
    findMany: ({ where }: { where: { userId: string; provedor: string } }) =>
      Promise.resolve(
        this.jogos
          .filter((j) => j.userId === where.userId && j.provedor === where.provedor)
          .map((j) => this.completa(j)),
      ),
    findUnique: ({
      where,
    }: {
      where: {
        gameId_provedor?: { gameId: string; provedor: string };
        userId_provedor_idExterno?: { userId: string; provedor: string; idExterno: string };
      };
    }) => {
      const porJogo = where.gameId_provedor;
      const porItem = where.userId_provedor_idExterno;
      const achada = this.jogos.find((j) =>
        porJogo
          ? j.gameId === porJogo.gameId && j.provedor === porJogo.provedor
          : j.userId === porItem?.userId &&
            j.provedor === porItem.provedor &&
            j.idExterno === porItem.idExterno,
      );
      return Promise.resolve(achada ? this.completa(achada) : null);
    },
    update: ({
      where,
      data,
    }: {
      where: { gameId_provedor: { gameId: string; provedor: string } };
      data: Partial<JogoPlataformaRow>;
    }) => {
      this.registrar();
      const achada = this.jogos.find(
        (j) =>
          j.gameId === where.gameId_provedor.gameId &&
          j.provedor === where.gameId_provedor.provedor,
      );
      if (!achada) {
        return Promise.reject(Object.assign(new Error('nao existe'), { code: 'P2025' }));
      }
      Object.assign(achada, data);
      return Promise.resolve(this.completa(achada));
    },
    /** As duas unicidades da migration: `(gameId, provedor)` e `(userId, provedor, idExterno)`. */
    create: ({ data }: { data: Omit<JogoPlataformaRow, 'id'> }) => {
      this.registrar();
      if (this.jogos.some((j) => j.gameId === data.gameId && j.provedor === data.provedor)) {
        return Promise.reject(
          Object.assign(new Error('unique'), {
            code: 'P2002',
            meta: { target: ['gameId', 'provedor'] },
          }),
        );
      }
      if (
        this.jogos.some(
          (j) =>
            j.userId === data.userId &&
            j.provedor === data.provedor &&
            j.idExterno === data.idExterno,
        )
      ) {
        return Promise.reject(
          Object.assign(new Error('unique'), {
            code: 'P2002',
            meta: { target: ['userId', 'provedor', 'idExterno'] },
          }),
        );
      }
      if (!this.games.some((g) => g.id === data.gameId)) {
        return Promise.reject(Object.assign(new Error('fk'), { code: 'P2003' }));
      }
      const row: JogoPlataformaRow = { ...data, id: randomUUID() };
      this.jogos.push(row);
      return Promise.resolve(this.completa(row));
    },
    deleteMany: ({
      where,
    }: {
      where: { userId: string; provedor?: string; id?: string; gameId?: string };
    }) => {
      this.registrar();
      const antes = this.jogos.length;
      this.jogos = this.jogos.filter(
        (j) =>
          !(
            j.userId === where.userId &&
            (where.provedor === undefined || j.provedor === where.provedor) &&
            (where.id === undefined || j.id === where.id) &&
            (where.gameId === undefined || j.gameId === where.gameId)
          ),
      );
      return Promise.resolve({ count: antes - this.jogos.length });
    },
  };

  /**
   * Como o Prisma: se uma operação falha, TODAS as escritas da transação são desfeitas. As operações chegam
   * já executadas (o fake é eager), então o estado anterior é o retrato tirado antes da PRIMEIRA delas.
   */
  $transaction = async (operacoes: Promise<unknown>[]) => {
    const anterior = this.historico[this.historico.length - operacoes.length];
    try {
      return await Promise.all(operacoes);
    } catch (error) {
      if (anterior) {
        this.jogos = anterior;
      }
      throw error;
    }
  };
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
  client: {
    obterPerfil: jest.Mock;
    listarJogos: jest.Mock;
    obterConquistasDoJogador: jest.Mock;
    obterSchema: jest.Mock;
    obterPercentuaisGlobais: jest.Mock;
  };
  /** O `PsnClient` de verdade, com as chamadas à Sony trocadas por mocks (o pacote nunca é carregado). */
  psn: PsnClient & {
    trocarNpsso: jest.Mock;
    renovar: jest.Mock;
    perfil: jest.Mock;
    resumoDeTrofeus: jest.Mock;
    jogados: jest.Mock;
    conjuntoDeTrofeus: jest.Mock;
    definicoesDeTrofeus: jest.Mock;
    ganhosDeTrofeus: jest.Mock;
  };
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
  const client = {
    obterPerfil: jest.fn(),
    listarJogos: jest.fn(),
    obterConquistasDoJogador: jest.fn(),
    obterSchema: jest.fn(),
    obterPercentuaisGlobais: jest.fn(),
  };
  const openId = Object.assign(new SteamOpenId(), { validarRetorno: jest.fn() });
  const psn = Object.assign(new PsnClient(), {
    trocarNpsso: jest.fn(),
    renovar: jest.fn(),
    perfil: jest.fn(),
    resumoDeTrofeus: jest.fn(),
    jogados: jest.fn(),
    conjuntoDeTrofeus: jest.fn(),
    definicoesDeTrofeus: jest.fn(),
    ganhosDeTrofeus: jest.fn(),
  });

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
      CifraDeCredencial,
      PsnSessao,
      PsnProvider,
      { provide: PsnClient, useValue: psn },
      { provide: SteamOpenId, useValue: openId },
      { provide: SteamClient, useValue: client },
      {
        provide: GAME_PROVIDERS,
        // Como o módulo de verdade: a PlayStation só entra com a chave de cifra.
        useFactory: (steam: SteamProvider, playstation: PsnProvider, cifra: CifraDeCredencial) =>
          cifra.disponivel ? [steam, playstation] : [steam],
        inject: [SteamProvider, PsnProvider, CifraDeCredencial],
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
    psn: psn as IntegrationsHttpApp['psn'],
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
