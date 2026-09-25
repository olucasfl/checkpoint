import { HttpException, Logger } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { type PrismaService } from '../../database/prisma.service';
import { AuthTokensService } from '../auth/auth-tokens.service';
import { IntegrationsService } from './integrations.service';
import {
  PerfilPrivadoError,
  PlataformaIndisponivelError,
  PlataformaItemNaoEncontradoError,
  PlataformaLimiteError,
  VinculoCanceladoError,
  VinculoRecusadoError,
} from './providers/plataforma-errors';
import { type GameProvider, type ItemDaBiblioteca } from './providers/game-provider';
import { ProviderRegistry } from './providers/provider-registry';
import { VinculoStateService } from './vinculo/vinculo-state.service';

// Valores sintéticos e óbvios (RULES.md §8).
const ACCESS_SECRET = 'segredo-de-acesso-sintetico-com-mais-de-32-caracteres';
const REFRESH_SECRET = 'segredo-de-refresh-sintetico-com-mais-de-32-caracteres';
const ANA = '11111111-1111-4111-8111-111111111111';
const BIA = '22222222-2222-4222-8222-222222222222';
const STEAM_ID = '76561190000000000';
const OUTRO_STEAM_ID = '76561190000000001';
const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);

const config = {
  get: (key: string) =>
    ({
      JWT_ACCESS_SECRET: ACCESS_SECRET,
      JWT_REFRESH_SECRET: REFRESH_SECRET,
      API_PUBLIC_URL: 'http://localhost:3333',
      WEB_PUBLIC_URL: 'http://localhost:5173',
    })[key],
} as unknown as ConfigService<never, true>;

const jwt = new JwtService({});

function item(idExterno: string, titulo: string, minutosJogados: number): ItemDaBiblioteca {
  return { idExterno, titulo, capaUrl: null, minutosJogados, ultimaVezJogadoEm: null };
}

function montar() {
  const prisma = {
    contaVinculada: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    game: { findMany: jest.fn(), findFirst: jest.fn() },
    jogoPlataforma: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((operacoes: Promise<unknown>[]) => Promise.all(operacoes)),
  };
  prisma.contaVinculada.findUnique.mockResolvedValue(null);
  prisma.contaVinculada.create.mockResolvedValue({ id: 'c1' });
  prisma.contaVinculada.update.mockResolvedValue({ id: 'c1' });
  prisma.contaVinculada.deleteMany.mockResolvedValue({ count: 1 });
  prisma.jogoPlataforma.findMany.mockResolvedValue([]);
  prisma.game.findMany.mockResolvedValue([]);
  prisma.jogoPlataforma.deleteMany.mockResolvedValue({ count: 0 });

  const provider = {
    id: 'STEAM' as const,
    iniciarVinculo: jest.fn((ctx: { state: string }) => ({
      url: `https://steamcommunity.com/openid/login?state=${ctx.state}`,
    })),
    concluirVinculo: jest.fn(),
    listarBiblioteca: jest.fn(),
    obterJogo: jest.fn(),
  };
  const registry = new ProviderRegistry([provider as unknown as GameProvider]);
  const vinculoState = new VinculoStateService(jwt, config as never);
  const service = new IntegrationsService(
    prisma as unknown as PrismaService,
    registry,
    vinculoState,
    config as never,
  );
  return { service, prisma, provider, vinculoState };
}

/** Faz o "ir à Steam": devolve o state e o nonce que o navegador levaria e traria de volta. */
async function iniciar(ctx: ReturnType<typeof montar>, userId = ANA) {
  const { nonce } = await ctx.service.iniciarVinculo(userId, 'STEAM');
  const state = (ctx.provider.iniciarVinculo.mock.calls.at(-1)?.[0] as { state: string }).state;
  return { state, nonce };
}

async function statusEcodeDe(
  promise: Promise<unknown>,
): Promise<{ status: number; code?: string }> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const http = error as HttpException;
    return { status: http.getStatus(), code: (http.getResponse() as { code?: string }).code };
  }
  throw new Error('esperava um erro HTTP');
}

let logCalls: string[];

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  logCalls = [];
  for (const method of ['error', 'warn', 'log', 'debug', 'verbose'] as const) {
    jest.spyOn(Logger.prototype, method).mockImplementation((...args: unknown[]) => {
      logCalls.push(args.map(String).join(' '));
    });
  }
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('IntegrationsService.iniciarVinculo (CA-06, CA-07)', () => {
  it('monta o retorno no domínio público da API e devolve a URL e o nonce do cookie', async () => {
    const ctx = montar();

    const { resposta, nonce } = await ctx.service.iniciarVinculo(ANA, 'STEAM');

    expect(ctx.provider.iniciarVinculo).toHaveBeenCalledWith({
      state: expect.any(String) as string,
      returnTo: 'http://localhost:3333/api/integracoes/steam/retorno',
      realm: 'http://localhost:3333',
    });
    expect(resposta.url).toContain('https://steamcommunity.com/openid/login');
    const { state } = await iniciar(ctx);
    await expect(ctx.vinculoState.verificar(state, 'STEAM')).resolves.toMatchObject({
      userId: ANA,
    });
    expect(nonce).toEqual(expect.any(String));
  });

  it('já vinculada → 409 PLATAFORMA_JA_VINCULADA, sem emitir state nem chamar o provider', async () => {
    const ctx = montar();
    ctx.prisma.contaVinculada.findUnique.mockResolvedValue({
      idExterno: STEAM_ID,
      nomeExibicao: 'x',
    });

    await expect(statusEcodeDe(ctx.service.iniciarVinculo(ANA, 'STEAM'))).resolves.toEqual({
      status: 409,
      code: 'PLATAFORMA_JA_VINCULADA',
    });
    expect(ctx.provider.iniciarVinculo).not.toHaveBeenCalled();
  });
});

describe('IntegrationsService.concluirVinculo', () => {
  it('o caminho feliz grava a conta e manda para /perfil?steam=vinculada (CA-08)', async () => {
    const ctx = montar();
    const { state, nonce } = await iniciar(ctx);
    ctx.provider.concluirVinculo.mockResolvedValue({
      idExterno: STEAM_ID,
      nomeExibicao: 'Jogador',
    });

    const resultado = await ctx.service.concluirVinculo('STEAM', { state }, nonce);

    expect(resultado).toEqual({ resultado: 'vinculada' });
    expect(ctx.prisma.contaVinculada.create).toHaveBeenCalledWith({
      data: { userId: ANA, provedor: 'STEAM', idExterno: STEAM_ID, nomeExibicao: 'Jogador' },
      select: { id: true },
    });
    expect(ctx.provider.concluirVinculo).toHaveBeenCalledWith(
      { state },
      { returnTo: 'http://localhost:3333/api/integracoes/steam/retorno' },
    );
    expect(ctx.service.urlDoRedirecionamento(resultado)).toBe(
      'http://localhost:5173/perfil?steam=vinculada',
    );
  });

  it.each([
    ['sem state', undefined],
    ['state vazio', ''],
    ['state que não é texto', ['a', 'b']],
    ['state que é um objeto', { a: 1 }],
  ])('%s → invalido, sem chamar a plataforma (CA-10)', async (_nome, state) => {
    const ctx = montar();

    await expect(ctx.service.concluirVinculo('STEAM', { state }, 'n')).resolves.toEqual({
      resultado: 'erro',
      motivo: 'invalido',
    });
    expect(ctx.provider.concluirVinculo).not.toHaveBeenCalled();
    expect(ctx.prisma.contaVinculada.create).not.toHaveBeenCalled();
  });

  it('state adulterado → invalido; vencido → expirado (CA-10)', async () => {
    const ctx = montar();
    const { state, nonce } = await iniciar(ctx);
    const adulterado = `${state.slice(0, -4)}${state.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`;

    await expect(
      ctx.service.concluirVinculo('STEAM', { state: adulterado }, nonce),
    ).resolves.toEqual({
      resultado: 'erro',
      motivo: 'invalido',
    });

    jest.spyOn(Date, 'now').mockReturnValue(NOW + 11 * 60_000);
    await expect(ctx.service.concluirVinculo('STEAM', { state }, nonce)).resolves.toEqual({
      resultado: 'erro',
      motivo: 'expirado',
    });
    expect(ctx.provider.concluirVinculo).not.toHaveBeenCalled();
  });

  it.each([
    ['sem cookie', undefined],
    ['cookie vazio', ''],
    ['nonce de outro vínculo', 'nonce-de-outro-navegador'],
  ])('%s → invalido: nada é gravado e a Steam nem é chamada (CA-09)', async (_nome, cookie) => {
    const ctx = montar();
    const { state } = await iniciar(ctx);

    await expect(ctx.service.concluirVinculo('STEAM', { state }, cookie)).resolves.toEqual({
      resultado: 'erro',
      motivo: 'invalido',
    });
    expect(ctx.provider.concluirVinculo).not.toHaveBeenCalled();
    expect(ctx.prisma.contaVinculada.create).not.toHaveBeenCalled();
  });

  it('um ACCESS TOKEN como state → invalido, sem chamar a Steam (CA-62)', async () => {
    const ctx = montar();
    const tokens = new AuthTokensService(jwt, config as never);
    const access = await tokens.signAccess(ANA, 'sessao');
    const refresh = await tokens.signRefresh(ANA, 'sessao');

    for (const token of [access, refresh]) {
      await expect(ctx.service.concluirVinculo('STEAM', { state: token }, 'n')).resolves.toEqual({
        resultado: 'erro',
        motivo: 'invalido',
      });
    }
    expect(ctx.provider.concluirVinculo).not.toHaveBeenCalled();
  });

  it.each([
    ['cancelado', new VinculoCanceladoError(), 'cancelado'],
    ['recusado pela Steam', new VinculoRecusadoError(), 'invalido'],
    ['Steam indisponível', new PlataformaIndisponivelError(), 'indisponivel'],
    ['Steam no limite', new PlataformaLimiteError(), 'indisponivel'],
  ])('a plataforma devolve %s → %s, nada gravado (CA-11, CA-12)', async (_nome, erro, motivo) => {
    const ctx = montar();
    const { state, nonce } = await iniciar(ctx);
    ctx.provider.concluirVinculo.mockRejectedValue(erro);

    await expect(ctx.service.concluirVinculo('STEAM', { state }, nonce)).resolves.toEqual({
      resultado: 'erro',
      motivo,
    });
    expect(ctx.prisma.contaVinculada.create).not.toHaveBeenCalled();
  });

  it('um erro que não é da plataforma (bug) NÃO vira redirecionamento: sobe', async () => {
    const ctx = montar();
    const { state, nonce } = await iniciar(ctx);
    ctx.provider.concluirVinculo.mockRejectedValue(new TypeError('bug'));

    await expect(ctx.service.concluirVinculo('STEAM', { state }, nonce)).rejects.toBeInstanceOf(
      TypeError,
    );
  });

  it('mesmo SteamID já vinculado → sucesso sem duplicar, e atualiza o nome (CA-13)', async () => {
    const ctx = montar();
    const { state, nonce } = await iniciar(ctx);
    ctx.prisma.contaVinculada.findUnique.mockResolvedValue({
      idExterno: STEAM_ID,
      nomeExibicao: 'Antigo',
    });
    ctx.provider.concluirVinculo.mockResolvedValue({ idExterno: STEAM_ID, nomeExibicao: 'Novo' });

    await expect(ctx.service.concluirVinculo('STEAM', { state }, nonce)).resolves.toEqual({
      resultado: 'vinculada',
    });
    expect(ctx.prisma.contaVinculada.create).not.toHaveBeenCalled();
    expect(ctx.prisma.contaVinculada.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { nomeExibicao: 'Novo' } }),
    );
  });

  it('OUTRO SteamID já vinculado → ja-vinculada, e o vínculo original fica (CA-13)', async () => {
    const ctx = montar();
    const { state, nonce } = await iniciar(ctx);
    ctx.prisma.contaVinculada.findUnique.mockResolvedValue({
      idExterno: STEAM_ID,
      nomeExibicao: 'Antigo',
    });
    ctx.provider.concluirVinculo.mockResolvedValue({
      idExterno: OUTRO_STEAM_ID,
      nomeExibicao: 'Outro',
    });

    await expect(ctx.service.concluirVinculo('STEAM', { state }, nonce)).resolves.toEqual({
      resultado: 'erro',
      motivo: 'ja-vinculada',
    });
    expect(ctx.prisma.contaVinculada.create).not.toHaveBeenCalled();
    expect(ctx.prisma.contaVinculada.update).not.toHaveBeenCalled();
  });

  it('corrida (P2002): reavalia contra o que ficou gravado', async () => {
    const ctx = montar();
    const { state, nonce } = await iniciar(ctx);
    ctx.provider.concluirVinculo.mockResolvedValue({ idExterno: STEAM_ID, nomeExibicao: 'N' });
    ctx.prisma.contaVinculada.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ idExterno: STEAM_ID, nomeExibicao: 'N' });
    ctx.prisma.contaVinculada.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );

    await expect(ctx.service.concluirVinculo('STEAM', { state }, nonce)).resolves.toEqual({
      resultado: 'vinculada',
    });
  });

  it('corrida (P2002) com OUTRO SteamID gravado → ja-vinculada', async () => {
    const ctx = montar();
    const { state, nonce } = await iniciar(ctx);
    ctx.provider.concluirVinculo.mockResolvedValue({ idExterno: STEAM_ID, nomeExibicao: 'N' });
    ctx.prisma.contaVinculada.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ idExterno: OUTRO_STEAM_ID, nomeExibicao: 'N' });
    ctx.prisma.contaVinculada.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );

    await expect(ctx.service.concluirVinculo('STEAM', { state }, nonce)).resolves.toEqual({
      resultado: 'erro',
      motivo: 'ja-vinculada',
    });
  });

  it('usuário que deixou de existir (P2003) → invalido; outro erro do banco sobe', async () => {
    const ctx = montar();
    const { state, nonce } = await iniciar(ctx);
    ctx.provider.concluirVinculo.mockResolvedValue({ idExterno: STEAM_ID, nomeExibicao: 'N' });
    ctx.prisma.contaVinculada.create.mockRejectedValueOnce(
      Object.assign(new Error('fk'), { code: 'P2003' }),
    );

    await expect(ctx.service.concluirVinculo('STEAM', { state }, nonce)).resolves.toEqual({
      resultado: 'erro',
      motivo: 'invalido',
    });

    ctx.prisma.contaVinculada.create.mockRejectedValueOnce(new Error('banco caiu'));
    await expect(ctx.service.concluirVinculo('STEAM', { state }, nonce)).rejects.toThrow(
      'banco caiu',
    );
  });

  it('a MESMA conta Steam pode ser vinculada por dois usuários do checkpoint (CA-65)', async () => {
    const ctx = montar();
    ctx.provider.concluirVinculo.mockResolvedValue({
      idExterno: STEAM_ID,
      nomeExibicao: 'Jogador',
    });
    const daAna = await iniciar(ctx, ANA);
    const daBia = await iniciar(ctx, BIA);

    await expect(
      ctx.service.concluirVinculo('STEAM', { state: daAna.state }, daAna.nonce),
    ).resolves.toEqual({
      resultado: 'vinculada',
    });
    await expect(
      ctx.service.concluirVinculo('STEAM', { state: daBia.state }, daBia.nonce),
    ).resolves.toEqual({
      resultado: 'vinculada',
    });

    const criados = ctx.prisma.contaVinculada.create.mock.calls.map(
      ([arg]) => (arg as { data: { userId: string; idExterno: string } }).data,
    );
    expect(criados).toEqual([
      expect.objectContaining({ userId: ANA, idExterno: STEAM_ID }),
      expect.objectContaining({ userId: BIA, idExterno: STEAM_ID }),
    ]);
  });

  it('o state de um usuário grava para ELE, nunca para outro (o userId vem do state, não da query)', async () => {
    const ctx = montar();
    const { state, nonce } = await iniciar(ctx, ANA);
    ctx.provider.concluirVinculo.mockResolvedValue({ idExterno: STEAM_ID, nomeExibicao: 'N' });

    await ctx.service.concluirVinculo('STEAM', { state, userId: BIA }, nonce);

    expect(ctx.prisma.contaVinculada.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: ANA }) as unknown }),
    );
  });

  it('o log de uma recusa tem só o provedor e o motivo, nunca o state, o SteamID nem o nonce (CA-58)', async () => {
    const ctx = montar();
    const { state, nonce } = await iniciar(ctx);
    ctx.provider.concluirVinculo.mockRejectedValue(new VinculoRecusadoError());

    await ctx.service.concluirVinculo('STEAM', { state, 'openid.claimed_id': STEAM_ID }, nonce);
    await ctx.service.concluirVinculo('STEAM', { state }, 'errado');

    const impresso = logCalls.join('\n');
    expect(impresso).toContain('Vínculo (STEAM) recusado: invalido');
    expect(impresso).not.toContain(state);
    expect(impresso).not.toContain(nonce);
    expect(impresso).not.toContain(STEAM_ID);
  });

  it('urlDoRedirecionamento leva só o motivo, sem SteamID nem state', () => {
    const { service } = montar();

    expect(service.urlDoRedirecionamento({ resultado: 'erro', motivo: 'ja-vinculada' })).toBe(
      'http://localhost:5173/perfil?steam=erro&motivo=ja-vinculada',
    );
  });
});

describe('IntegrationsService.desvincular (CA-19)', () => {
  it('apaga a conta e os dados por provedor do usuário, numa transação, sem tocar em jogo', async () => {
    const ctx = montar();
    ctx.prisma.contaVinculada.findUnique.mockResolvedValue({
      idExterno: STEAM_ID,
      nomeExibicao: 'x',
    });

    await ctx.service.desvincular(ANA, 'STEAM');

    expect(ctx.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(ctx.prisma.jogoPlataforma.deleteMany).toHaveBeenCalledWith({
      where: { userId: ANA, provedor: 'STEAM' },
    });
    expect(ctx.prisma.contaVinculada.deleteMany).toHaveBeenCalledWith({
      where: { userId: ANA, provedor: 'STEAM' },
    });
  });

  it('sem conta vinculada → 409 PLATAFORMA_NAO_VINCULADA e nada é apagado', async () => {
    const ctx = montar();

    await expect(statusEcodeDe(ctx.service.desvincular(ANA, 'STEAM'))).resolves.toEqual({
      status: 409,
      code: 'PLATAFORMA_NAO_VINCULADA',
    });
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('IntegrationsService.listarContas', () => {
  it('só as contas do usuário, só os campos do contrato', async () => {
    const ctx = montar();
    ctx.prisma.contaVinculada.findMany.mockResolvedValue([
      {
        provedor: 'STEAM',
        idExterno: STEAM_ID,
        nomeExibicao: 'Jogador',
        vinculadaEm: new Date('2026-09-25T12:00:00Z'),
        userId: ANA,
        id: 'interno',
      },
    ]);

    const contas = await ctx.service.listarContas(ANA);

    expect(ctx.prisma.contaVinculada.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: ANA } }),
    );
    expect(contas).toEqual([
      {
        provedor: 'STEAM',
        idExterno: STEAM_ID,
        nomeExibicao: 'Jogador',
        vinculadaEm: '2026-09-25T12:00:00.000Z',
      },
    ]);
  });
});

describe('IntegrationsService.perfil', () => {
  const perfilBasico = {
    nomeExibicao: 'Jogador',
    avatarUrl: 'https://avatars.steamstatic.com/a.jpg',
    perfilUrl: 'https://steamcommunity.com/profiles/x/',
    publico: true,
  };

  function comContaEBiblioteca(itens: ItemDaBiblioteca[]) {
    const ctx = montar();
    ctx.prisma.contaVinculada.findUnique.mockResolvedValue({
      idExterno: STEAM_ID,
      nomeExibicao: 'Jogador',
    });
    ctx.provider.listarBiblioteca.mockResolvedValue({ itens, perfil: perfilBasico });
    return ctx;
  }

  it('sem conta vinculada → 409 PLATAFORMA_NAO_VINCULADA (CA-17)', async () => {
    const ctx = montar();

    await expect(statusEcodeDe(ctx.service.perfil(ANA, 'STEAM'))).resolves.toEqual({
      status: 409,
      code: 'PLATAFORMA_NAO_VINCULADA',
    });
    expect(ctx.provider.listarBiblioteca).not.toHaveBeenCalled();
  });

  it('totais, horas, os 3 mais jogados e as conquistas SÓ dos jogos vinculados (CA-16)', async () => {
    const ctx = comContaEBiblioteca([
      item('1', 'Zebra', 600),
      item('2', 'Alfa', 600),
      item('3', 'Beta', 1200),
      item('4', 'Gama', 60),
      item('5', 'Nunca jogado', 0),
    ]);
    ctx.prisma.jogoPlataforma.findMany.mockResolvedValue([
      { conquistasTotal: 40, conquistasDesbloqueadas: 12 },
      { conquistasTotal: 10, conquistasDesbloqueadas: 10 },
      { conquistasTotal: null, conquistasDesbloqueadas: null },
      { conquistasTotal: 0, conquistasDesbloqueadas: 0 },
    ]);

    const perfil = await ctx.service.perfil(ANA, 'STEAM');

    expect(perfil).toMatchObject({
      provedor: 'STEAM',
      nomeExibicao: 'Jogador',
      avatarUrl: 'https://avatars.steamstatic.com/a.jpg',
      totalJogos: 5,
      minutosTotais: 2460,
      conquistas: { desbloqueadas: 22, total: 50, jogosVinculados: 4 },
      consultadoEm: new Date(NOW).toISOString(),
    });
    // Por horas; empate pelo título; sem quem nunca jogou; no máximo 3.
    expect(perfil.maisJogados.map((jogo) => jogo.titulo)).toEqual(['Beta', 'Alfa', 'Zebra']);
    expect(ctx.prisma.jogoPlataforma.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: ANA, provedor: 'STEAM' } }),
    );
  });

  it('sem jogo vinculado o cartão diz 0 conquistas em 0 jogos (etapa 2)', async () => {
    const ctx = comContaEBiblioteca([item('1', 'A', 10)]);

    await expect(ctx.service.perfil(ANA, 'STEAM')).resolves.toMatchObject({
      conquistas: { desbloqueadas: 0, total: 0, jogosVinculados: 0 },
    });
  });

  it('a 2ª leitura em menos de 10 min NÃO chama a Steam (cache); depois dos 10 min, chama (CA-16)', async () => {
    const ctx = comContaEBiblioteca([item('1', 'A', 10)]);

    await ctx.service.perfil(ANA, 'STEAM');
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 9 * 60_000);
    await ctx.service.perfil(ANA, 'STEAM');
    expect(ctx.provider.listarBiblioteca).toHaveBeenCalledTimes(1);

    jest.spyOn(Date, 'now').mockReturnValue(NOW + 10 * 60_000 + 1);
    await ctx.service.perfil(ANA, 'STEAM');
    expect(ctx.provider.listarBiblioteca).toHaveBeenCalledTimes(2);
  });

  it('atualizar: antes de 30 s devolve o que já tem (mesmo consultadoEm, sem chamar a Steam); depois consulta (CA-18)', async () => {
    const ctx = comContaEBiblioteca([item('1', 'A', 10)]);
    const primeira = await ctx.service.perfil(ANA, 'STEAM', { atualizar: true });

    jest.spyOn(Date, 'now').mockReturnValue(NOW + 29_000);
    const segunda = await ctx.service.perfil(ANA, 'STEAM', { atualizar: true });
    expect(segunda.consultadoEm).toBe(primeira.consultadoEm);
    expect(ctx.provider.listarBiblioteca).toHaveBeenCalledTimes(1);

    jest.spyOn(Date, 'now').mockReturnValue(NOW + 30_000);
    const terceira = await ctx.service.perfil(ANA, 'STEAM', { atualizar: true });
    expect(terceira.consultadoEm).not.toBe(primeira.consultadoEm);
    expect(ctx.provider.listarBiblioteca).toHaveBeenCalledTimes(2);
  });

  it('a leitura comum (sem atualizar) NUNCA ignora o cache, mesmo depois de 30 s', async () => {
    const ctx = comContaEBiblioteca([item('1', 'A', 10)]);
    await ctx.service.perfil(ANA, 'STEAM');

    jest.spyOn(Date, 'now').mockReturnValue(NOW + 5 * 60_000);
    await ctx.service.perfil(ANA, 'STEAM');

    expect(ctx.provider.listarBiblioteca).toHaveBeenCalledTimes(1);
  });

  it('o nome novo da Steam é guardado no vínculo; igual, não escreve (CA-16)', async () => {
    const ctx = comContaEBiblioteca([item('1', 'A', 10)]);
    ctx.prisma.contaVinculada.findUnique.mockResolvedValue({
      idExterno: STEAM_ID,
      nomeExibicao: 'Conta Steam',
    });

    await ctx.service.perfil(ANA, 'STEAM');
    expect(ctx.prisma.contaVinculada.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { nomeExibicao: 'Jogador' } }),
    );

    const igual = comContaEBiblioteca([item('1', 'A', 10)]);
    await igual.service.perfil(ANA, 'STEAM');
    expect(igual.prisma.contaVinculada.update).not.toHaveBeenCalled();
  });

  it('falha ao gravar o nome não derruba o cartão (é só rótulo)', async () => {
    const ctx = comContaEBiblioteca([item('1', 'A', 10)]);
    ctx.prisma.contaVinculada.findUnique.mockResolvedValue({
      idExterno: STEAM_ID,
      nomeExibicao: 'Antigo',
    });
    ctx.prisma.contaVinculada.update.mockRejectedValue(new Error('banco'));

    await expect(ctx.service.perfil(ANA, 'STEAM')).resolves.toMatchObject({
      nomeExibicao: 'Jogador',
    });
  });

  it.each([
    ['perfil privado (SIMULADO, sem fixture real)', new PerfilPrivadoError()],
    ['Steam indisponível', new PlataformaIndisponivelError()],
    ['Steam no limite', new PlataformaLimiteError()],
  ])(
    '%s sobe como erro de domínio (o filtro vira 409 ou 502) e NÃO entra no cache (CA-20, CA-21)',
    async (_nome, erro) => {
      const ctx = comContaEBiblioteca([]);
      ctx.provider.listarBiblioteca.mockRejectedValueOnce(erro);

      await expect(ctx.service.perfil(ANA, 'STEAM')).rejects.toBe(erro);

      ctx.provider.listarBiblioteca.mockResolvedValueOnce({ itens: [], perfil: perfilBasico });
      await expect(ctx.service.perfil(ANA, 'STEAM')).resolves.toMatchObject({ totalJogos: 0 });
      expect(ctx.provider.listarBiblioteca).toHaveBeenCalledTimes(2);
    },
  );

  it('biblioteca pública e vazia → cartão com 0 jogos, sem erro (CA-20)', async () => {
    const ctx = comContaEBiblioteca([]);

    await expect(ctx.service.perfil(ANA, 'STEAM')).resolves.toMatchObject({
      totalJogos: 0,
      minutosTotais: 0,
      maisJogados: [],
    });
  });

  it('duas contas do checkpoint com o MESMO SteamID dividem a consulta à Steam (dado público) (CA-65)', async () => {
    const ctx = comContaEBiblioteca([item('1', 'A', 10)]);

    await ctx.service.perfil(ANA, 'STEAM');
    await ctx.service.perfil(BIA, 'STEAM');

    expect(ctx.provider.listarBiblioteca).toHaveBeenCalledTimes(1);
    // Mas as conquistas somadas vêm do banco de CADA usuário.
    expect(ctx.prisma.jogoPlataforma.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { userId: BIA, provedor: 'STEAM' } }),
    );
  });
});

describe('IntegrationsService.biblioteca (CA-23 a CA-25)', () => {
  const perfilBasico = {
    nomeExibicao: 'Jogador',
    avatarUrl: null,
    perfilUrl: null,
    publico: true,
  };

  function comBiblioteca(itens: ItemDaBiblioteca[]) {
    const ctx = montar();
    ctx.prisma.contaVinculada.findUnique.mockResolvedValue({
      idExterno: STEAM_ID,
      nomeExibicao: 'Jogador',
    });
    ctx.provider.listarBiblioteca.mockResolvedValue({ itens, perfil: perfilBasico });
    return ctx;
  }

  const titulos = (itens: { titulo: string }[]) => itens.map((i) => i.titulo);
  const jogo = (id: string, titulo: string, plataforma = 'PC') => ({ id, titulo, plataforma });

  it('sem conta vinculada → 409 PLATAFORMA_NAO_VINCULADA, sem consultar a plataforma', async () => {
    const ctx = montar();

    await expect(statusEcodeDe(ctx.service.biblioteca(ANA, 'STEAM'))).resolves.toEqual({
      status: 409,
      code: 'PLATAFORMA_NAO_VINCULADA',
    });
    expect(ctx.provider.listarBiblioteca).not.toHaveBeenCalled();
  });

  it('ordena por horas (decrescente) e, no empate, pelo título', async () => {
    const ctx = comBiblioteca([
      item('1', 'Zebra', 600),
      item('2', 'Alfa', 600),
      item('3', 'Beta', 1200),
      item('4', 'Gama', 0),
    ]);

    expect(titulos(await ctx.service.biblioteca(ANA, 'STEAM'))).toEqual([
      'Beta',
      'Alfa',
      'Zebra',
      'Gama',
    ]);
  });

  it('o limite padrão é 30 e o limite pedido vale (CA-23)', async () => {
    const ctx = comBiblioteca(
      Array.from({ length: 35 }, (_, i) => item(String(i), `Jogo ${i}`, i)),
    );

    expect(await ctx.service.biblioteca(ANA, 'STEAM')).toHaveLength(30);
    expect(await ctx.service.biblioteca(ANA, 'STEAM', { limite: 2 })).toHaveLength(2);
    expect(await ctx.service.biblioteca(ANA, 'STEAM', { limite: 50 })).toHaveLength(35);
    // O mais jogado vem primeiro: o corte é dos MENOS jogados.
    expect((await ctx.service.biblioteca(ANA, 'STEAM', { limite: 1 }))[0]?.titulo).toBe('Jogo 34');
  });

  it('a busca ignora caixa, acento e pontuação, e acha por trecho (CA-23)', async () => {
    const ctx = comBiblioteca([
      item('1', 'Pokémon™: Legends – Arceus', 10),
      item('2', 'POKER Night', 20),
      item('3', 'Celeste', 30),
    ]);

    expect(titulos(await ctx.service.biblioteca(ANA, 'STEAM', { busca: 'pokemon' }))).toEqual([
      'Pokémon™: Legends – Arceus',
    ]);
    expect(titulos(await ctx.service.biblioteca(ANA, 'STEAM', { busca: 'PO' }))).toEqual([
      'POKER Night',
      'Pokémon™: Legends – Arceus',
    ]);
    expect(
      titulos(await ctx.service.biblioteca(ANA, 'STEAM', { busca: 'legends arceus' })),
    ).toEqual(['Pokémon™: Legends – Arceus']);
  });

  it('busca só de símbolos não filtra nada; busca sem resultado devolve [] sem tocar no banco', async () => {
    const ctx = comBiblioteca([item('1', 'Celeste', 10), item('2', 'Hades', 5)]);

    expect(await ctx.service.biblioteca(ANA, 'STEAM', { busca: '™ !!' })).toHaveLength(2);
    expect(await ctx.service.biblioteca(ANA, 'STEAM', { busca: 'inexistente' })).toEqual([]);
    expect(ctx.prisma.game.findMany).toHaveBeenCalledTimes(1);
  });

  it('cada item traz o que a Steam sabe: horas, última vez jogado em ISO e a capa', async () => {
    const ctx = comBiblioteca([
      {
        idExterno: '7',
        titulo: 'Celeste',
        capaUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/7/library_600x900.jpg',
        minutosJogados: 90,
        ultimaVezJogadoEm: new Date('2026-02-22T17:24:41Z'),
      },
      item('8', 'Hades', 0),
    ]);

    const [primeiro, segundo] = await ctx.service.biblioteca(ANA, 'STEAM');

    expect(primeiro).toEqual({
      idExterno: '7',
      titulo: 'Celeste',
      capaUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/7/library_600x900.jpg',
      minutosJogados: 90,
      ultimaVezJogadoEm: '2026-02-22T17:24:41.000Z',
      jogosParecidos: [],
      vinculadoA: null,
    });
    expect(segundo).toMatchObject({ ultimaVezJogadoEm: null });
  });

  it('jogosParecidos: o jogo do catálogo com a MESMA chave de título, sem caixa, acento nem ™ (CA-24)', async () => {
    const ctx = comBiblioteca([item('1', 'CELESTE™', 10), item('2', 'Celeste 64', 5)]);
    ctx.prisma.game.findMany.mockResolvedValue([jogo('g1', 'Celeste'), jogo('g2', 'Hades')]);

    const [celeste, celeste64] = await ctx.service.biblioteca(ANA, 'STEAM');

    expect(celeste?.jogosParecidos).toEqual([{ id: 'g1', titulo: 'Celeste', plataforma: 'PC' }]);
    // Igualdade, sem aproximação: "Celeste 64" não é "Celeste".
    expect(celeste64?.jogosParecidos).toEqual([]);
  });

  it('o jogo do catálogo que já está ligado à Steam NÃO aparece em jogosParecidos (CA-24)', async () => {
    const ctx = comBiblioteca([item('1', 'Celeste', 10)]);
    ctx.prisma.game.findMany.mockResolvedValue([
      jogo('g1', 'Celeste'),
      jogo('g2', 'Celeste', 'PS5'),
    ]);
    ctx.prisma.jogoPlataforma.findMany.mockResolvedValue([{ gameId: 'g1', idExterno: '999' }]);

    const [celeste] = await ctx.service.biblioteca(ANA, 'STEAM');

    expect(celeste?.jogosParecidos).toEqual([{ id: 'g2', titulo: 'Celeste', plataforma: 'PS5' }]);
  });

  it('o mesmo título em plataformas diferentes: todos aparecem, no máximo 3; plataforma vazia vira null', async () => {
    const ctx = comBiblioteca([item('1', 'Celeste', 10)]);
    ctx.prisma.game.findMany.mockResolvedValue([
      jogo('g1', 'Celeste', 'PC'),
      jogo('g2', 'Celeste', 'PS5'),
      jogo('g3', 'Celeste', ''),
      jogo('g4', 'Celeste', 'Nintendo Switch'),
      jogo('g5', 'Celeste', 'Xbox'),
    ]);

    const [celeste] = await ctx.service.biblioteca(ANA, 'STEAM');

    expect(celeste?.jogosParecidos).toHaveLength(3);
    expect(celeste?.jogosParecidos.map((j) => j.plataforma)).toEqual(['PC', 'PS5', null]);
  });

  it('vinculadoA: o jogo ao qual o item já está ligado; um item ligado não sugere outros (CA-25)', async () => {
    const ctx = comBiblioteca([item('504230', 'Celeste', 10)]);
    ctx.prisma.game.findMany.mockResolvedValue([
      jogo('g1', 'Celeste (PS5)', 'PS5'),
      jogo('g2', 'Celeste', 'PC'),
    ]);
    ctx.prisma.jogoPlataforma.findMany.mockResolvedValue([{ gameId: 'g1', idExterno: '504230' }]);

    const [celeste] = await ctx.service.biblioteca(ANA, 'STEAM');

    expect(celeste?.vinculadoA).toEqual({ id: 'g1', titulo: 'Celeste (PS5)', plataforma: 'PS5' });
    expect(celeste?.jogosParecidos).toEqual([]);
  });

  it('título só de símbolos não sugere nada (chave vazia não casa com tudo)', async () => {
    const ctx = comBiblioteca([item('1', '™®', 10)]);
    ctx.prisma.game.findMany.mockResolvedValue([jogo('g1', '!!!')]);

    const [estranho] = await ctx.service.biblioteca(ANA, 'STEAM');

    expect(estranho?.jogosParecidos).toEqual([]);
  });

  it('NUNCA vincula: só lê (nenhuma escrita no banco) (CA-34)', async () => {
    const ctx = comBiblioteca([item('1', 'Celeste', 10)]);
    ctx.prisma.game.findMany.mockResolvedValue([jogo('g1', 'Celeste')]);

    await ctx.service.biblioteca(ANA, 'STEAM');

    expect(ctx.prisma.contaVinculada.create).not.toHaveBeenCalled();
    expect(ctx.prisma.contaVinculada.update).not.toHaveBeenCalled();
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('as consultas ao banco são só do usuário e do provedor', async () => {
    const ctx = comBiblioteca([item('1', 'Celeste', 10)]);

    await ctx.service.biblioteca(BIA, 'STEAM');

    expect(ctx.prisma.game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: BIA } }),
    );
    expect(ctx.prisma.jogoPlataforma.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: BIA, provedor: 'STEAM' } }),
    );
  });

  it('usa o MESMO cache do cartão do perfil: perfil e biblioteca juntos chamam a Steam uma vez só', async () => {
    const ctx = comBiblioteca([item('1', 'Celeste', 10)]);

    await ctx.service.perfil(ANA, 'STEAM');
    await ctx.service.biblioteca(ANA, 'STEAM');
    await ctx.service.biblioteca(ANA, 'STEAM', { busca: 'cel' });

    expect(ctx.provider.listarBiblioteca).toHaveBeenCalledTimes(1);
  });

  it('a biblioteca lida primeiro também serve o perfil; passados 10 min, consulta de novo', async () => {
    const ctx = comBiblioteca([item('1', 'Celeste', 10)]);

    await ctx.service.biblioteca(ANA, 'STEAM');
    await ctx.service.perfil(ANA, 'STEAM');
    expect(ctx.provider.listarBiblioteca).toHaveBeenCalledTimes(1);

    jest.spyOn(Date, 'now').mockReturnValue(NOW + 10 * 60_000 + 1);
    await ctx.service.biblioteca(ANA, 'STEAM');
    expect(ctx.provider.listarBiblioteca).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['perfil privado (SIMULADO, sem fixture real)', new PerfilPrivadoError()],
    ['Steam indisponível', new PlataformaIndisponivelError()],
    ['Steam no limite', new PlataformaLimiteError()],
  ])(
    '%s sobe como erro de domínio e NÃO entra no cache (o "Tentar de novo" refaz) (CA-39)',
    async (_nome, erro) => {
      const ctx = comBiblioteca([]);
      ctx.provider.listarBiblioteca.mockRejectedValueOnce(erro);

      await expect(ctx.service.biblioteca(ANA, 'STEAM')).rejects.toBe(erro);

      ctx.provider.listarBiblioteca.mockResolvedValueOnce({
        itens: [item('1', 'A', 1)],
        perfil: perfilBasico,
      });
      await expect(ctx.service.biblioteca(ANA, 'STEAM')).resolves.toHaveLength(1);
    },
  );

  it('biblioteca pública e vazia: lista vazia, sem erro e sem tocar no banco', async () => {
    const ctx = comBiblioteca([]);

    await expect(ctx.service.biblioteca(ANA, 'STEAM')).resolves.toEqual([]);
    expect(ctx.prisma.game.findMany).not.toHaveBeenCalled();
  });
});

describe('IntegrationsService.vincularJogo (CA-26 a CA-31, CA-66, CA-67)', () => {
  const GAME = '33333333-3333-4333-8333-333333333333';
  const OUTRO_GAME = '44444444-4444-4444-8444-444444444444';
  const APP = '504230';

  const dadosDaSteam = {
    idExterno: APP,
    minutosJogados: 90,
    ultimaVezJogadoEm: new Date('2026-02-01T00:00:00Z'),
    conquistasTotal: 40,
    conquistasDesbloqueadas: 12,
    capaUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/504230/library_600x900.jpg',
  };

  /** Um jogo do usuário, a conta vinculada, sem vínculo nenhum: o caso simples. */
  function comJogo(vinculos: { doJogo?: unknown; doItem?: unknown } = {}) {
    const ctx = montar();
    ctx.prisma.game.findFirst.mockResolvedValue({ id: GAME, titulo: 'Celeste' });
    ctx.prisma.contaVinculada.findUnique.mockResolvedValue({
      idExterno: STEAM_ID,
      nomeExibicao: 'x',
    });
    ctx.prisma.jogoPlataforma.findUnique.mockImplementation(
      ({ where }: { where: { gameId_provedor?: unknown } }) =>
        Promise.resolve(
          where.gameId_provedor ? (vinculos.doJogo ?? null) : (vinculos.doItem ?? null),
        ),
    );
    ctx.prisma.jogoPlataforma.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...data }),
    );
    ctx.provider.obterJogo.mockResolvedValue({ dados: dadosDaSteam, conquistas: [], aviso: null });
    return ctx;
  }

  const vincular = (
    ctx: ReturnType<typeof montar>,
    corpo: { idExterno: string; mover?: boolean } = { idExterno: APP },
  ) => ctx.service.vincularJogo(ANA, 'STEAM', GAME, corpo);

  it('liga o item ao jogo e grava o último valor da plataforma (CA-26)', async () => {
    const ctx = comJogo();

    const dados = await vincular(ctx);

    expect(dados).toEqual({
      provedor: 'STEAM',
      idExterno: APP,
      minutosJogados: 90,
      ultimaVezJogadoEm: '2026-02-01T00:00:00.000Z',
      conquistasTotal: 40,
      conquistasDesbloqueadas: 12,
      capaUrl: dadosDaSteam.capaUrl,
      atualizadoEm: new Date(NOW).toISOString(),
    });
    expect(ctx.prisma.jogoPlataforma.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: ANA,
          gameId: GAME,
          provedor: 'STEAM',
          idExterno: APP,
        }) as unknown,
      }),
    );
    expect(ctx.provider.obterJogo).toHaveBeenCalledWith(STEAM_ID, APP);
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('nunca lê nem altera o jogo: só confere que é do usuário (a plataforma do jogo fica como está) (CA-37)', async () => {
    const ctx = comJogo();

    await vincular(ctx);

    expect(ctx.prisma.game.findFirst).toHaveBeenCalledWith({
      where: { id: GAME, userId: ANA },
      select: { id: true },
    });
    expect(ctx.prisma.game).not.toHaveProperty('update');
  });

  it('a resposta não traz userId nem gameId', async () => {
    const dados = await vincular(comJogo());

    expect(Object.keys(dados).sort()).toEqual([
      'atualizadoEm',
      'capaUrl',
      'conquistasDesbloqueadas',
      'conquistasTotal',
      'idExterno',
      'minutosJogados',
      'provedor',
      'ultimaVezJogadoEm',
    ]);
  });

  it('jogo que não é do usuário → 404 com a mesma mensagem do catálogo, sem tocar em mais nada (CA-27)', async () => {
    const ctx = comJogo();
    ctx.prisma.game.findFirst.mockResolvedValue(null);

    const erro: unknown = await vincular(ctx).catch((e: unknown) => e);

    expect(erro).toMatchObject({ status: 404, message: 'Jogo não encontrado' });
    expect(ctx.prisma.contaVinculada.findUnique).not.toHaveBeenCalled();
    expect(ctx.provider.obterJogo).not.toHaveBeenCalled();
  });

  it('sem conta vinculada → 409 PLATAFORMA_NAO_VINCULADA, sem chamar a plataforma (CA-27)', async () => {
    const ctx = comJogo();
    ctx.prisma.contaVinculada.findUnique.mockResolvedValue(null);

    await expect(statusEcodeDe(vincular(ctx))).resolves.toEqual({
      status: 409,
      code: 'PLATAFORMA_NAO_VINCULADA',
    });
    expect(ctx.provider.obterJogo).not.toHaveBeenCalled();
  });

  it('o mesmo item no mesmo jogo é idempotente: devolve o gravado e NÃO chama a plataforma', async () => {
    const gravado = {
      ...dadosDaSteam,
      provedor: 'STEAM',
      atualizadoEm: new Date('2026-09-24T00:00:00Z'),
    };
    const ctx = comJogo({ doJogo: gravado });

    const dados = await vincular(ctx);

    expect(dados.atualizadoEm).toBe('2026-09-24T00:00:00.000Z');
    expect(ctx.provider.obterJogo).not.toHaveBeenCalled();
    expect(ctx.prisma.jogoPlataforma.create).not.toHaveBeenCalled();
  });

  it('o jogo já tem OUTRO item → 409 PLATAFORMA_JOGO_JA_VINCULADO, sem plataforma, nem com mover (CA-29, CA-67)', async () => {
    const ctx = comJogo({
      doJogo: { ...dadosDaSteam, idExterno: '999', provedor: 'STEAM', atualizadoEm: new Date() },
    });

    for (const corpo of [{ idExterno: APP }, { idExterno: APP, mover: true }]) {
      await expect(statusEcodeDe(vincular(ctx, corpo))).resolves.toEqual({
        status: 409,
        code: 'PLATAFORMA_JOGO_JA_VINCULADO',
      });
    }
    expect(ctx.provider.obterJogo).not.toHaveBeenCalled();
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('item já ligado a outro jogo, sem mover → 409 com jogoAtual e a plataforma NÃO é chamada (CA-28, CA-67)', async () => {
    const ctx = comJogo({ doItem: { id: 'linha-antiga', gameId: OUTRO_GAME } });
    ctx.prisma.game.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === GAME ? { id: GAME } : { id: OUTRO_GAME, titulo: 'Celeste (PS5)' },
      ),
    );

    const erro = (await vincular(ctx).catch((e: unknown) => e)) as HttpException;

    expect(erro.getStatus()).toBe(409);
    expect(erro.getResponse()).toMatchObject({
      statusCode: 409,
      code: 'PLATAFORMA_ITEM_JA_VINCULADO',
      jogoAtual: { id: OUTRO_GAME, titulo: 'Celeste (PS5)' },
    });
    expect(ctx.provider.obterJogo).not.toHaveBeenCalled();
    expect(ctx.prisma.jogoPlataforma.create).not.toHaveBeenCalled();
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('com mover: apaga a linha do jogo antigo e cria a do novo NUMA transação; nada é copiado (CA-28)', async () => {
    const ctx = comJogo({ doItem: { id: 'linha-antiga', gameId: OUTRO_GAME } });

    await vincular(ctx, { idExterno: APP, mover: true });

    expect(ctx.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(ctx.prisma.jogoPlataforma.deleteMany).toHaveBeenCalledWith({
      where: { id: 'linha-antiga', userId: ANA },
    });
    const criado = (
      ctx.prisma.jogoPlataforma.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    ).data;
    // Os dados do novo jogo vêm FRESCOS da plataforma, não do vínculo antigo.
    expect(criado).toMatchObject({ gameId: GAME, minutosJogados: 90, conquistasTotal: 40 });
    expect(ctx.provider.obterJogo).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['perfil privado (SIMULADO, sem fixture real)', new PerfilPrivadoError()],
    ['Steam indisponível', new PlataformaIndisponivelError()],
    ['Steam no limite', new PlataformaLimiteError()],
  ])(
    'mover com a plataforma falhando (%s): NADA muda, o vínculo continua no jogo antigo (CA-66)',
    async (_nome, erro) => {
      const ctx = comJogo({ doItem: { id: 'linha-antiga', gameId: OUTRO_GAME } });
      ctx.provider.obterJogo.mockRejectedValue(erro);

      await expect(vincular(ctx, { idExterno: APP, mover: true })).rejects.toBe(erro);

      expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
      expect(ctx.prisma.jogoPlataforma.deleteMany).not.toHaveBeenCalled();
      expect(ctx.prisma.jogoPlataforma.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'perfil privado (simulado, sem fixture real)',
      new PerfilPrivadoError(),
      'PLATAFORMA_PERFIL_PRIVADO',
    ],
    [
      'item fora da biblioteca',
      new PlataformaItemNaoEncontradoError(),
      'PLATAFORMA_ITEM_NAO_ENCONTRADO',
    ],
    ['Steam indisponível', new PlataformaIndisponivelError(), 'PLATAFORMA_INDISPONIVEL'],
    ['Steam no limite', new PlataformaLimiteError(), 'PLATAFORMA_LIMITE'],
  ])('%s: o erro sobe e NENHUMA linha é criada (CA-27, CA-30)', async (_nome, erro, code) => {
    const ctx = comJogo();
    ctx.provider.obterJogo.mockRejectedValue(erro);

    const capturado: unknown = await vincular(ctx).catch((e: unknown) => e);

    expect(capturado).toBe(erro);
    expect(capturado).toMatchObject({ code });
    expect(ctx.prisma.jogoPlataforma.create).not.toHaveBeenCalled();
  });

  it('conquistas negadas (SIMULADO, sem fixture real): o vínculo é gravado com as contagens null (CA-30)', async () => {
    const ctx = comJogo();
    ctx.provider.obterJogo.mockResolvedValue({
      dados: { ...dadosDaSteam, conquistasTotal: null, conquistasDesbloqueadas: null },
      conquistas: [],
      aviso: 'CONQUISTAS_PRIVADAS',
    });

    const dados = await vincular(ctx);

    expect(dados).toMatchObject({
      minutosJogados: 90,
      conquistasTotal: null,
      conquistasDesbloqueadas: null,
    });
  });

  it('corrida (P2002) em (gameId, provedor) → 409 PLATAFORMA_JOGO_JA_VINCULADO', async () => {
    const ctx = comJogo();
    ctx.prisma.jogoPlataforma.create.mockRejectedValue(
      Object.assign(new Error('unique'), {
        code: 'P2002',
        meta: { target: ['gameId', 'provedor'] },
      }),
    );

    await expect(statusEcodeDe(vincular(ctx))).resolves.toEqual({
      status: 409,
      code: 'PLATAFORMA_JOGO_JA_VINCULADO',
    });
  });

  it('corrida (P2002) em (userId, provedor, idExterno) → 409 PLATAFORMA_ITEM_JA_VINCULADO com jogoAtual', async () => {
    const ctx = comJogo();
    ctx.prisma.jogoPlataforma.create.mockRejectedValue(
      Object.assign(new Error('unique'), {
        code: 'P2002',
        meta: { target: ['userId', 'provedor', 'idExterno'] },
      }),
    );
    // Depois da corrida, o item aparece ligado a outro jogo.
    ctx.prisma.jogoPlataforma.findUnique.mockImplementation(
      ({ where }: { where: { gameId_provedor?: unknown } }) =>
        Promise.resolve(
          where.gameId_provedor ? null : calls++ === 0 ? null : { gameId: OUTRO_GAME },
        ),
    );
    let calls = 0;
    ctx.prisma.game.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === GAME ? { id: GAME } : { id: OUTRO_GAME, titulo: 'Celeste (PS5)' },
      ),
    );

    const erro = (await vincular(ctx).catch((e: unknown) => e)) as HttpException;

    expect(erro.getResponse()).toMatchObject({
      code: 'PLATAFORMA_ITEM_JA_VINCULADO',
      jogoAtual: { id: OUTRO_GAME },
    });
  });

  it('o jogo sumiu no meio do caminho (P2003) → 404 do catálogo; outro erro do banco sobe', async () => {
    const ctx = comJogo();
    ctx.prisma.jogoPlataforma.create.mockRejectedValueOnce(
      Object.assign(new Error('fk'), { code: 'P2003' }),
    );

    await expect(vincular(ctx)).rejects.toMatchObject({
      status: 404,
      message: 'Jogo não encontrado',
    });

    ctx.prisma.jogoPlataforma.create.mockRejectedValueOnce(new Error('banco caiu'));
    await expect(vincular(ctx)).rejects.toThrow('banco caiu');
  });

  it('todas as consultas de vínculo filtram por usuário', async () => {
    const ctx = comJogo();

    await vincular(ctx);

    expect(ctx.prisma.jogoPlataforma.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_provedor_idExterno: { userId: ANA, provedor: 'STEAM', idExterno: APP } },
      }),
    );
    expect(ctx.prisma.game.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: GAME, userId: ANA } }),
    );
  });

  it('a MESMA conta Steam em dois usuários: cada um liga o mesmo appid ao seu jogo (CA-65)', async () => {
    const ctx = comJogo();

    await ctx.service.vincularJogo(ANA, 'STEAM', GAME, { idExterno: APP });
    await ctx.service.vincularJogo(BIA, 'STEAM', GAME, { idExterno: APP });

    const donos = ctx.prisma.jogoPlataforma.create.mock.calls.map(
      ([arg]) => (arg as { data: { userId: string } }).data.userId,
    );
    expect(donos).toEqual([ANA, BIA]);
  });
});

describe('IntegrationsService.desvincularJogo (CA-31)', () => {
  const GAME = '33333333-3333-4333-8333-333333333333';

  it('remove só a camada deste jogo, filtrando por jogo, usuário e provedor', async () => {
    const ctx = montar();
    ctx.prisma.game.findFirst.mockResolvedValue({ id: GAME });
    ctx.prisma.jogoPlataforma.deleteMany.mockResolvedValue({ count: 1 });

    await ctx.service.desvincularJogo(ANA, 'STEAM', GAME);

    expect(ctx.prisma.jogoPlataforma.deleteMany).toHaveBeenCalledWith({
      where: { gameId: GAME, userId: ANA, provedor: 'STEAM' },
    });
    expect(ctx.prisma.contaVinculada.deleteMany).not.toHaveBeenCalled();
  });

  it('jogo sem vínculo → 404 PLATAFORMA_VINCULO_NAO_ENCONTRADO', async () => {
    const ctx = montar();
    ctx.prisma.game.findFirst.mockResolvedValue({ id: GAME });
    ctx.prisma.jogoPlataforma.deleteMany.mockResolvedValue({ count: 0 });

    await expect(statusEcodeDe(ctx.service.desvincularJogo(ANA, 'STEAM', GAME))).resolves.toEqual({
      status: 404,
      code: 'PLATAFORMA_VINCULO_NAO_ENCONTRADO',
    });
  });

  it('jogo de outro usuário → 404 do catálogo, sem apagar nada', async () => {
    const ctx = montar();
    ctx.prisma.game.findFirst.mockResolvedValue(null);

    await expect(ctx.service.desvincularJogo(BIA, 'STEAM', GAME)).rejects.toMatchObject({
      status: 404,
      message: 'Jogo não encontrado',
    });
    expect(ctx.prisma.jogoPlataforma.deleteMany).not.toHaveBeenCalled();
  });
});
