import { type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { type AddressInfo } from 'node:net';
import {
  CSRF_HEADER,
  type AuthResponse,
  type ContaVinculada,
  type DadosJogoPlataforma,
  type EncerrarOutrasSessoesResponse,
  type Game,
  type GameRatingKey,
  type ItemBiblioteca,
  type JogoParecido,
  type PerfilPlataforma,
  type SessaoAtiva,
  type Usuario,
} from '@checkpoint/shared';
import { createValidationPipe } from '../common/pipes/app-validation.pipe';
import { API_GLOBAL_PREFIX } from '../config/app.config';
import { PrismaService } from '../database/prisma.service';
import { AccessTokenGuard } from '../modules/auth/access-token.guard';
import { AuthController } from '../modules/auth/auth.controller';
import { AuthService } from '../modules/auth/auth.service';
import { AuthThrottlerGuard } from '../modules/auth/auth-throttler.guard';
import { AuthTokensService } from '../modules/auth/auth-tokens.service';
import { CsrfHeaderGuard } from '../modules/auth/csrf-header.guard';
import { PasswordHasher } from '../modules/auth/password-hasher';
import { FakeAuthPrisma, fakeHasher } from '../modules/auth/testing/fake-auth-prisma';
import { StorageService } from '../modules/games/cover/storage.service';
import { GamesService } from '../modules/games/games.service';
import { ANA_ID, startGamesApp, type GamesHttpApp } from '../modules/games/testing/games-http-app';
import { startIntegrationsApp } from '../modules/integrations/testing/integrations-http-app';
import { UsersController } from '../modules/users/users.controller';
import { UsersService } from '../modules/users/users.service';
import { problemas, type Mapa, type Tipo } from './forma';

/**
 * CONTRATO com o web (só leitura de formato, sem banco nem Supabase): sobe os controllers de verdade (guard, pipe,
 * serialização), pede o que o web pede e confere que o CORPO REAL tem exatamente a forma dos tipos do
 * `@checkpoint/shared`. Cada mapa abaixo é um `Record<keyof T, Tipo>`: o compilador obriga o mapa a acompanhar o
 * tipo, e o teste obriga a API a acompanhar o mapa. O fixture do web (`apps/web/src/test/contrato-api.ts`) usa os
 * MESMOS mapas em espelho, então o mock do navegador também não diverge em silêncio.
 */

const NOTAS: Record<GameRatingKey, Tipo> = {
  gameplay: 'number?',
  historia: 'number?',
  graficos: 'number?',
  trilhaSonora: 'number?',
  performance: 'number?',
};

const DADOS_PLATAFORMA: Record<keyof DadosJogoPlataforma, Tipo> = {
  provedor: 'string',
  idExterno: 'string',
  minutosJogados: 'number',
  ultimaVezJogadoEm: 'iso?',
  conquistasTotal: 'number?',
  conquistasDesbloqueadas: 'number?',
  capaUrl: 'string?',
  atualizadoEm: 'iso',
};

const GAME: Record<keyof Game, Tipo> = {
  id: 'uuid',
  titulo: 'string',
  plataforma: 'string?',
  status: 'string',
  notas: { objeto: NOTAS },
  notaMedia: 'number?',
  descricao: 'string?',
  capaUrl: 'string?',
  criadoEm: 'iso',
  atualizadoEm: 'iso',
  dadosPlataforma: { lista: DADOS_PLATAFORMA },
};

const CONTA: Record<keyof ContaVinculada, Tipo> = {
  provedor: 'string',
  idExterno: 'string',
  nomeExibicao: 'string',
  vinculadaEm: 'iso',
};

const JOGO_PARECIDO: Record<keyof JogoParecido, Tipo> = {
  id: 'uuid',
  titulo: 'string',
  plataforma: 'string?',
};

const ITEM_BIBLIOTECA: Record<keyof ItemBiblioteca, Tipo> = {
  idExterno: 'string',
  titulo: 'string',
  capaUrl: 'string?',
  minutosJogados: 'number',
  ultimaVezJogadoEm: 'iso?',
  jogosParecidos: { lista: JOGO_PARECIDO },
  vinculadoA: { objeto: JOGO_PARECIDO, nulo: true },
};

const PERFIL: Record<keyof PerfilPlataforma, Tipo> = {
  provedor: 'string',
  nomeExibicao: 'string',
  avatarUrl: 'string?',
  perfilUrl: 'string?',
  totalJogos: 'number',
  minutosTotais: 'number',
  maisJogados: {
    lista: { idExterno: 'string', titulo: 'string', capaUrl: 'string?', minutosJogados: 'number' },
  },
  conquistas: {
    objeto: { desbloqueadas: 'number', total: 'number', jogosVinculados: 'number' },
  },
  consultadoEm: 'iso',
};

const USUARIO: Record<keyof Usuario, Tipo> = {
  id: 'uuid',
  nome: 'string',
  email: 'string',
  criadoEm: 'iso',
};

const AUTH_RESPONSE: Record<keyof AuthResponse, Tipo> = {
  accessToken: 'string',
  usuario: { objeto: USUARIO },
};

const SESSAO: Record<keyof SessaoAtiva, Tipo> = {
  id: 'uuid',
  dispositivo: 'string',
  criadoEm: 'iso',
  ultimoUsoEm: 'iso',
  atual: 'boolean',
};

const ENCERRAR_OUTRAS: Record<keyof EncerrarOutrasSessoesResponse, Tipo> = { encerradas: 'number' };

/** Os problemas de UM corpo contra o mapa (vazio = a API devolveu exatamente a forma do shared). */
function conforme(corpo: unknown, mapa: Mapa): string[] {
  return problemas(corpo, mapa);
}

function conformeLista(corpo: unknown, mapa: Mapa): string[] {
  return Array.isArray(corpo)
    ? corpo.flatMap((item, i) => problemas(item, mapa, `$[${i}]`))
    : [`$: esperava lista, veio ${typeof corpo}`];
}

describe('contrato: GET/POST /games (Game)', () => {
  const game = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const storage = { upload: jest.fn(), remove: jest.fn(), publicUrl: jest.fn() };
  let ctx: GamesHttpApp;

  const linha = (extra: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    userId: ANA_ID,
    titulo: 'Hollow Knight',
    plataforma: '',
    status: 'JOGANDO',
    notaGameplay: null,
    notaHistoria: null,
    notaGraficos: null,
    notaTrilhaSonora: null,
    notaPerformance: null,
    descricao: null,
    capaPath: null,
    tituloNormalizado: 'hollow knight',
    plataformaNormalizada: '',
    criadoEm: new Date('2026-09-23T12:00:00.000Z'),
    atualizadoEm: new Date('2026-09-23T12:00:00.000Z'),
    ...extra,
  });
  const dadosDaLinha = {
    provedor: 'STEAM',
    idExterno: '504230',
    minutosJogados: 2550,
    ultimaVezJogadoEm: new Date('2026-09-20T12:00:00.000Z'),
    conquistasTotal: 40,
    conquistasDesbloqueadas: 12,
    capaUrl: null,
    atualizadoEm: new Date('2026-09-25T11:00:00.000Z'),
  };

  beforeEach(async () => {
    Object.values(game).forEach((fn) => fn.mockReset());
    Object.values(storage).forEach((fn) => fn.mockReset());
    storage.publicUrl.mockImplementation((path: string) => `https://exemplo.supabase.co/${path}`);
    ctx = await startGamesApp(game, storage);
  });
  afterEach(async () => {
    await ctx.app.close();
  });

  async function pedir(metodo: string, caminho: string, corpo?: unknown) {
    const token = await ctx.tokenFor(ANA_ID);
    const resposta = await fetch(`${ctx.baseUrl}${caminho}`, {
      method: metodo,
      headers: {
        authorization: `Bearer ${token}`,
        ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    return { status: resposta.status, corpo: (await resposta.json()) as unknown };
  }

  it('GET /games: cada jogo tem exatamente as chaves do tipo Game, com null (nunca "") sem plataforma e dadosPlataforma sempre lista', async () => {
    game.findMany.mockResolvedValue([
      linha(),
      linha({
        titulo: 'Celeste',
        plataforma: 'PC',
        status: 'ZERADO',
        notaGameplay: 92,
        capaPath: 'u/g/capa.png',
        descricao: 'texto',
        dadosPlataforma: [dadosDaLinha],
      }),
      linha({ titulo: 'Sem include', dadosPlataforma: undefined }),
    ]);

    const { status, corpo } = await pedir('GET', '/games');

    expect(status).toBe(200);
    expect(conformeLista(corpo, GAME)).toEqual([]);
    const jogos = corpo as Game[];
    expect(jogos[0]?.plataforma).toBeNull();
    expect(jogos[1]?.capaUrl).toBe('https://exemplo.supabase.co/u/g/capa.png');
    expect(jogos[1]?.notaMedia).toBe(9.2);
    expect(jogos[2]?.dadosPlataforma).toEqual([]);
  });

  it('POST /games: o jogo criado também tem a forma de Game (dadosPlataforma: [])', async () => {
    game.findFirst.mockResolvedValue(null);
    game.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(linha({ ...data })),
    );

    const { status, corpo } = await pedir('POST', '/games', {
      titulo: 'Hades',
      plataforma: 'PC',
      status: 'JOGANDO',
    });

    expect(status).toBe(201);
    expect(conforme(corpo, GAME)).toEqual([]);
  });
});

describe('contrato: /integracoes (ContaVinculada, PerfilPlataforma, ItemBiblioteca)', () => {
  it('as respostas reais têm exatamente a forma dos tipos do shared', async () => {
    const ctx = await startIntegrationsApp();
    try {
      const token = await ctx.tokenFor('0b6c1f7e-2a3d-4e5f-8a9b-1c2d3e4f5a6b');
      const ana = '0b6c1f7e-2a3d-4e5f-8a9b-1c2d3e4f5a6b';
      ctx.db.contas.push({
        id: randomUUID(),
        userId: ana,
        provedor: 'STEAM',
        idExterno: '76561190000000000',
        nomeExibicao: 'Jogador Sintetico',
        vinculadaEm: new Date('2026-09-25T12:00:00.000Z'),
      });
      const jogoId = randomUUID();
      ctx.db.games.push({ id: jogoId, userId: ana, titulo: 'Alfa', plataforma: '' });
      ctx.db.games.push({ id: randomUUID(), userId: ana, titulo: 'Beta', plataforma: 'PC' });
      ctx.db.jogos.push({
        id: randomUUID(),
        userId: ana,
        gameId: jogoId,
        provedor: 'STEAM',
        idExterno: '2',
        conquistasTotal: 40,
        conquistasDesbloqueadas: 12,
      });
      ctx.client.obterPerfil.mockResolvedValue({
        visibilidade: 3,
        nome: 'Jogador Sintetico',
        avatarUrl: 'https://avatars.steamstatic.com/0000_full.jpg',
        perfilUrl: 'https://steamcommunity.com/profiles/x/',
      });
      ctx.client.listarJogos.mockResolvedValue({
        privada: false,
        total: 3,
        jogos: [
          {
            appid: '1',
            nome: 'Alfa',
            minutosJogados: 600,
            ultimaVezJogadoEm: new Date('2026-02-01T00:00:00Z'),
          },
          { appid: '2', nome: 'Beta', minutosJogados: 1200, ultimaVezJogadoEm: null },
          { appid: '3', nome: 'Gama', minutosJogados: 0, ultimaVezJogadoEm: null },
        ],
      });

      const pedir = async (caminho: string) => {
        const resposta = await fetch(`${ctx.baseUrl}${caminho}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        return { status: resposta.status, corpo: (await resposta.json()) as unknown };
      };

      const contas = await pedir('/integracoes');
      expect(contas.status).toBe(200);
      expect(conformeLista(contas.corpo, CONTA)).toEqual([]);

      const perfil = await pedir('/integracoes/steam/perfil');
      expect(perfil.status).toBe(200);
      expect(conforme(perfil.corpo, PERFIL)).toEqual([]);

      const biblioteca = await pedir('/integracoes/steam/biblioteca');
      expect(biblioteca.status).toBe(200);
      expect(conformeLista(biblioteca.corpo, ITEM_BIBLIOTECA)).toEqual([]);
      const itens = biblioteca.corpo as ItemBiblioteca[];
      expect(itens.length).toBeGreaterThan(0);
      // o item já ligado a um jogo traz `vinculadoA`; os outros, null, e o web trata os dois
      expect(itens.some((i) => i.vinculadoA !== null)).toBe(true);
    } finally {
      await ctx.app.close();
    }
  });
});

describe('contrato: /auth e /users (AuthResponse, Usuario, SessaoAtiva)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeEach(async () => {
    const env = {
      NODE_ENV: 'development',
      JWT_ACCESS_SECRET: 'segredo-de-acesso-sintetico-com-mais-de-32-caracteres',
      JWT_REFRESH_SECRET: 'segredo-de-refresh-sintetico-com-mais-de-32-caracteres',
      AUTH_REGISTRATION_OPEN: true,
    };
    const storage = { upload: jest.fn(), remove: jest.fn(), publicUrl: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }),
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
        { provide: PrismaService, useValue: new FakeAuthPrisma() },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix(API_GLOBAL_PREFIX);
    app.use(cookieParser());
    app.useGlobalPipes(createValidationPipe());
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/${API_GLOBAL_PREFIX}`;
  });
  afterEach(async () => {
    await app.close();
  });

  async function pedir(
    metodo: string,
    caminho: string,
    opcoes: { corpo?: unknown; bearer?: string; cookie?: string; csrf?: boolean } = {},
  ) {
    const resposta = await fetch(`${baseUrl}${caminho}`, {
      method: metodo,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36',
        ...(opcoes.corpo === undefined ? {} : { 'content-type': 'application/json' }),
        ...(opcoes.bearer ? { authorization: `Bearer ${opcoes.bearer}` } : {}),
        ...(opcoes.cookie ? { cookie: opcoes.cookie } : {}),
        ...(opcoes.csrf ? { [CSRF_HEADER]: '1' } : {}),
      },
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    });
    const texto = await resposta.text();
    return {
      status: resposta.status,
      corpo: texto ? (JSON.parse(texto) as unknown) : undefined,
      cookie: resposta.headers.getSetCookie()[0]?.split(';')[0],
    };
  }

  it('registro, login, refresh, me, sessões, PATCH /users/me e encerrar outras têm a forma do shared', async () => {
    const registro = await pedir('POST', '/auth/registro', {
      corpo: { nome: 'Ana Teste', email: 'ana@exemplo.com', senha: 'segredo-forte' },
    });
    expect(registro.status).toBe(201);
    expect(conforme(registro.corpo, AUTH_RESPONSE)).toEqual([]);

    const login = await pedir('POST', '/auth/login', {
      corpo: { email: 'ana@exemplo.com', senha: 'segredo-forte' },
    });
    expect(login.status).toBe(200);
    expect(conforme(login.corpo, AUTH_RESPONSE)).toEqual([]);
    const { accessToken } = login.corpo as AuthResponse;

    const refresh = await pedir('POST', '/auth/refresh', { cookie: login.cookie, csrf: true });
    expect(refresh.status).toBe(200);
    expect(conforme(refresh.corpo, AUTH_RESPONSE)).toEqual([]);

    const me = await pedir('GET', '/auth/me', { bearer: accessToken });
    expect(conforme(me.corpo, USUARIO)).toEqual([]);

    const sessoes = await pedir('GET', '/auth/sessoes', { bearer: accessToken });
    expect(sessoes.status).toBe(200);
    expect(conformeLista(sessoes.corpo, SESSAO)).toEqual([]);
    expect((sessoes.corpo as SessaoAtiva[]).some((s) => s.atual)).toBe(true);

    const perfil = await pedir('PATCH', '/users/me', {
      bearer: accessToken,
      corpo: { nome: 'Ana Souza' },
    });
    expect(perfil.status).toBe(200);
    expect(conforme(perfil.corpo, USUARIO)).toEqual([]);

    const encerrar = await pedir('DELETE', '/auth/sessoes', { bearer: accessToken });
    expect(encerrar.status).toBe(200);
    expect(conforme(encerrar.corpo, ENCERRAR_OUTRAS)).toEqual([]);
  });
});
