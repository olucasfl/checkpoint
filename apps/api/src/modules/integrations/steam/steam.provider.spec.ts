import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type ConfigService } from '@nestjs/config';
import { type EnvironmentVariables } from '../../../config/env.validation';
import {
  PerfilPrivadoError,
  PlataformaIndisponivelError,
  PlataformaItemNaoEncontradoError,
  PlataformaLimiteError,
} from '../providers/plataforma-errors';
import {
  OpenIdCanceladoError,
  OpenIdInvalidoError,
  STEAM_OPENID_ENDPOINT,
  type SteamOpenId,
} from './steam-open-id';
import { NOME_PADRAO_DA_CONTA, SteamProvider, anoDaCriacao, statusDaSteam } from './steam.provider';
import {
  SteamClient,
  type SteamBiblioteca,
  type SteamConquistaDoSchema,
  type SteamConquistasDoJogador,
  type SteamPerfil,
} from './steam.client';

// Valores sintéticos e óbvios (RULES.md §8).
const STEAM_ID = '76561190000000000';
const RETURN_BASE = 'http://localhost:3333/api/integracoes/steam/retorno';
const STATE = 'STATE.SINTETICO.XYZ';

const perfilPublico: SteamPerfil = {
  visibilidade: 3,
  nome: 'Jogador Sintetico',
  avatarUrl: 'https://avatars.steamstatic.com/0000_full.jpg',
  perfilUrl: 'https://steamcommunity.com/profiles/x/',
};

const bibliotecaPublica: SteamBiblioteca = {
  privada: false,
  total: 2,
  jogos: [
    {
      appid: '1794680',
      nome: 'Vampire Survivors',
      minutosJogados: 550,
      ultimaVezJogadoEm: new Date('2026-02-22T17:24:41Z'),
    },
    { appid: '1774580', nome: 'Um jogo', minutosJogados: 0, ultimaVezJogadoEm: null },
  ],
};

function montar() {
  const client = {
    obterPerfil: jest.fn<Promise<SteamPerfil | null>, [string]>(),
    listarJogos: jest.fn<Promise<SteamBiblioteca>, [string, { appId?: string }?]>(),
    obterConquistasDoJogador: jest.fn<Promise<SteamConquistasDoJogador>, [string, string]>(),
    obterSchema: jest.fn<Promise<SteamConquistaDoSchema[]>, [string]>(),
    obterPercentuaisGlobais: jest.fn<Promise<Map<string, number>>, [string]>(),
  };
  const openId = {
    montarUrl: jest.fn<string, [{ returnTo: string; realm: string }]>(
      (ctx) => `${STEAM_OPENID_ENDPOINT}?return_to=${encodeURIComponent(ctx.returnTo)}`,
    ),
    validarRetorno: jest.fn<Promise<string>, [Record<string, unknown>, string]>(),
  };
  const provider = new SteamProvider(
    client as unknown as SteamClient,
    openId as unknown as SteamOpenId,
  );
  return { client, openId, provider };
}

describe('SteamProvider.iniciarVinculo', () => {
  it('põe o state na URL de retorno e passa o realm (CA-06)', () => {
    const { provider, openId } = montar();

    const { url } = provider.iniciarVinculo({
      state: STATE,
      returnTo: RETURN_BASE,
      realm: 'http://localhost:3333',
    });

    expect(openId.montarUrl).toHaveBeenCalledWith({
      returnTo: `${RETURN_BASE}?state=${STATE}`,
      realm: 'http://localhost:3333',
    });
    expect(url.startsWith(STEAM_OPENID_ENDPOINT)).toBe(true);
  });
});

describe('SteamProvider.concluirVinculo', () => {
  it('valida contra o return_to que ele mesmo montou e devolve o SteamID e o nome (CA-08)', async () => {
    const { provider, openId, client } = montar();
    openId.validarRetorno.mockResolvedValue(STEAM_ID);
    client.obterPerfil.mockResolvedValue(perfilPublico);
    const query = { state: STATE, 'openid.mode': 'id_res' };

    await expect(provider.concluirVinculo(query, { returnTo: RETURN_BASE })).resolves.toEqual({
      idExterno: STEAM_ID,
      nomeExibicao: 'Jogador Sintetico',
    });

    expect(openId.validarRetorno).toHaveBeenCalledWith(query, `${RETURN_BASE}?state=${STATE}`);
    expect(client.obterPerfil).toHaveBeenCalledWith(STEAM_ID);
  });

  it.each([
    ['GetPlayerSummaries indisponível', () => Promise.reject(new PlataformaIndisponivelError())],
    ['GetPlayerSummaries no limite', () => Promise.reject(new PlataformaLimiteError())],
    ['a Steam não conhece o ID', () => Promise.resolve(null)],
    ['nome vazio', () => Promise.resolve({ ...perfilPublico, nome: '   ' })],
  ])(
    '%s: o vínculo já provado NÃO se desfaz; o nome vira "Conta Steam" (CA-14)',
    async (_nome, perfil) => {
      const { provider, openId, client } = montar();
      openId.validarRetorno.mockResolvedValue(STEAM_ID);
      client.obterPerfil.mockImplementation(perfil);

      await expect(
        provider.concluirVinculo({ state: STATE }, { returnTo: RETURN_BASE }),
      ).resolves.toEqual({ idExterno: STEAM_ID, nomeExibicao: NOME_PADRAO_DA_CONTA });
    },
  );

  it('um erro que não é da plataforma (bug) NÃO é engolido', async () => {
    const { provider, openId, client } = montar();
    openId.validarRetorno.mockResolvedValue(STEAM_ID);
    client.obterPerfil.mockRejectedValue(new TypeError('bug'));

    await expect(
      provider.concluirVinculo({ state: STATE }, { returnTo: RETURN_BASE }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('o nome é aparado e cortado em 80 caracteres (a coluna cabe 80)', async () => {
    const { provider, openId, client } = montar();
    openId.validarRetorno.mockResolvedValue(STEAM_ID);
    client.obterPerfil.mockResolvedValue({ ...perfilPublico, nome: `  ${'x'.repeat(200)}  ` });

    const { nomeExibicao } = await provider.concluirVinculo(
      { state: STATE },
      { returnTo: RETURN_BASE },
    );

    expect(nomeExibicao).toBe('x'.repeat(80));
  });

  it.each([
    ['cancelado', new OpenIdCanceladoError()],
    ['inválido', new OpenIdInvalidoError('return_to')],
    ['Steam indisponível', new PlataformaIndisponivelError()],
  ])(
    'o erro do OpenID (%s) sobe para quem responde, e o nome nem é consultado',
    async (_nome, erro) => {
      const { provider, openId, client } = montar();
      openId.validarRetorno.mockRejectedValue(erro);

      await expect(
        provider.concluirVinculo({ state: STATE }, { returnTo: RETURN_BASE }),
      ).rejects.toBe(erro);
      expect(client.obterPerfil).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '', 42, ['a']])(
    'sem state de texto (%j) → OpenIdInvalidoError, sem chamar a Steam',
    async (state) => {
      const { provider, openId } = montar();

      await expect(
        provider.concluirVinculo({ state } as unknown as Record<string, string>, {
          returnTo: RETURN_BASE,
        }),
      ).rejects.toBeInstanceOf(OpenIdInvalidoError);
      expect(openId.validarRetorno).not.toHaveBeenCalled();
    },
  );
});

describe('SteamProvider.listarBiblioteca', () => {
  it('devolve os itens (com capa oficial) e o perfil público, com avatar e link seguros (CA-16)', async () => {
    const { provider, client } = montar();
    client.obterPerfil.mockResolvedValue(perfilPublico);
    client.listarJogos.mockResolvedValue(bibliotecaPublica);

    const { itens, perfil } = await provider.listarBiblioteca(STEAM_ID);

    expect(itens).toEqual([
      {
        idExterno: '1794680',
        titulo: 'Vampire Survivors',
        capaUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1794680/library_600x900.jpg',
        minutosJogados: 550,
        ultimaVezJogadoEm: new Date('2026-02-22T17:24:41Z'),
      },
      expect.objectContaining({ idExterno: '1774580', minutosJogados: 0, ultimaVezJogadoEm: null }),
    ]);
    expect(perfil).toEqual({
      nomeExibicao: 'Jogador Sintetico',
      avatarUrl: 'https://avatars.steamstatic.com/0000_full.jpg',
      perfilUrl: 'https://steamcommunity.com/profiles/x/',
      publico: true,
      membroDesdeAno: null,
      status: null,
      jogandoAgora: null,
    });
  });

  it('o ano de criação e o status saem de timecreated, personastate e gameextrainfo (SIMULADO: sem fixture real de timecreated)', async () => {
    const { provider, client } = montar();
    client.listarJogos.mockResolvedValue(bibliotecaPublica);

    client.obterPerfil.mockResolvedValue({ ...perfilPublico, criadoEmUnix: 1300000000, estado: 1 });
    await expect(provider.listarBiblioteca(STEAM_ID)).resolves.toMatchObject({
      perfil: { membroDesdeAno: 2011, status: 'online', jogandoAgora: null },
    });

    client.obterPerfil.mockResolvedValue({ ...perfilPublico, estado: 0 });
    await expect(provider.listarBiblioteca(STEAM_ID)).resolves.toMatchObject({
      perfil: { status: 'offline' },
    });

    client.obterPerfil.mockResolvedValue({
      ...perfilPublico,
      estado: 1,
      jogandoAgora: 'Celeste',
    });
    await expect(provider.listarBiblioteca(STEAM_ID)).resolves.toMatchObject({
      perfil: { status: 'jogando', jogandoAgora: 'Celeste' },
    });
  });

  it('avatar de outro host vira null (a URL vem de uma resposta externa)', async () => {
    const { provider, client } = montar();
    client.obterPerfil.mockResolvedValue({
      ...perfilPublico,
      avatarUrl: 'https://evil.example/a.jpg',
    });
    client.listarJogos.mockResolvedValue(bibliotecaPublica);

    const { perfil } = await provider.listarBiblioteca(STEAM_ID);

    expect(perfil.avatarUrl).toBeNull();
  });

  it.each([
    ['visibilidade 1 (perfil privado)', { ...perfilPublico, visibilidade: 1 }, bibliotecaPublica],
    ['visibilidade 2 (só amigos)', { ...perfilPublico, visibilidade: 2 }, bibliotecaPublica],
    ['visibilidade desconhecida', { ...perfilPublico, visibilidade: null }, bibliotecaPublica],
    [
      'perfil público mas "detalhes do jogo" privados (sem game_count)',
      perfilPublico,
      { privada: true, total: 0, jogos: [] },
    ],
  ])(
    '(SIMULADO, sem fixture real) %s → PerfilPrivadoError (PLATAFORMA_PERFIL_PRIVADO, CA-20)',
    async (_nome, perfil, biblioteca) => {
      const { provider, client } = montar();
      client.obterPerfil.mockResolvedValue(perfil);
      client.listarJogos.mockResolvedValue(biblioteca);

      const erro: unknown = await provider.listarBiblioteca(STEAM_ID).catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(PerfilPrivadoError);
      expect(erro).toMatchObject({ code: 'PLATAFORMA_PERFIL_PRIVADO' });
    },
  );

  it('(SIMULADO, sem fixture real) biblioteca pública e VAZIA (game_count 0) não é erro: devolve zero itens (CA-20)', async () => {
    const { provider, client } = montar();
    client.obterPerfil.mockResolvedValue(perfilPublico);
    client.listarJogos.mockResolvedValue({ privada: false, total: 0, jogos: [] });

    await expect(provider.listarBiblioteca(STEAM_ID)).resolves.toMatchObject({ itens: [] });
  });

  it('a Steam não conhece o ID → PlataformaIndisponivelError (não "privado")', async () => {
    const { provider, client } = montar();
    client.obterPerfil.mockResolvedValue(null);
    client.listarJogos.mockResolvedValue(bibliotecaPublica);

    await expect(provider.listarBiblioteca(STEAM_ID)).rejects.toBeInstanceOf(
      PlataformaIndisponivelError,
    );
  });

  it.each([
    ['indisponível', new PlataformaIndisponivelError()],
    ['limite', new PlataformaLimiteError()],
  ])('falha da Steam (%s) sobe como está (CA-21)', async (_nome, erro) => {
    const { provider, client } = montar();
    client.obterPerfil.mockResolvedValue(perfilPublico);
    client.listarJogos.mockRejectedValue(erro);

    await expect(provider.listarBiblioteca(STEAM_ID)).rejects.toBe(erro);
  });
});

describe('SteamProvider com o SteamClient de verdade e as respostas reais (fixtures)', () => {
  function fixtureResponse(name: string): Response {
    const { status, body } = JSON.parse(
      readFileSync(join(__dirname, '__fixtures__', name), 'utf8'),
    ) as { status: number; body: unknown };
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=UTF-8' },
    });
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('perfil público + biblioteca reais → itens, capas e perfil sanitizado', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) =>
        Promise.resolve(
          String(input).includes('GetPlayerSummaries')
            ? fixtureResponse('player-summaries.publico.json')
            : fixtureResponse('owned-games.publico.json'),
        ),
      );
    const config = { get: () => 'ABCDEF0123456789ABCDEF0123456789' } as unknown as ConfigService<
      EnvironmentVariables,
      true
    >;
    const provider = new SteamProvider(new SteamClient(config), {} as SteamOpenId);

    const { itens, perfil } = await provider.listarBiblioteca(STEAM_ID);

    expect(itens).toHaveLength(6);
    expect(itens.every((item) => item.capaUrl?.endsWith('/library_600x900.jpg'))).toBe(true);
    expect(itens.find((item) => item.minutosJogados === 0)?.ultimaVezJogadoEm).toBeNull();
    expect(perfil).toMatchObject({ nomeExibicao: 'Jogador Sintetico', publico: true });
    expect(perfil.avatarUrl).toMatch(/^https:\/\/avatars\.steamstatic\.com\//);
  });
});

describe('SteamProvider.obterJogo — o resumo (etapa 3)', () => {
  const APP_ID = '1794680';
  const jogoDaBiblioteca: SteamBiblioteca['jogos'][number] = {
    appid: APP_ID,
    nome: 'Vampire Survivors',
    minutosJogados: 550,
    ultimaVezJogadoEm: new Date('2026-02-22T17:24:41Z'),
  };
  const conquista = (id: string, desbloqueada: boolean) => ({
    id,
    desbloqueada,
    desbloqueadaEm: desbloqueada ? new Date('2026-02-01T00:00:00Z') : null,
    nome: null,
    descricao: null,
  });

  function comBiblioteca(jogos = [jogoDaBiblioteca]) {
    const ctx = montar();
    ctx.client.listarJogos.mockResolvedValue({ privada: false, total: jogos.length, jogos });
    return ctx;
  }

  it('horas, última vez jogado, capa e as contagens; a lista de conquistas vem vazia (CA-26)', async () => {
    const ctx = comBiblioteca();
    ctx.client.obterConquistasDoJogador.mockResolvedValue({
      tipo: 'ok',
      nomeDoJogo: 'Vampire Survivors',
      conquistas: [conquista('A', true), conquista('B', true), conquista('C', false)],
    });

    const resultado = await ctx.provider.obterJogo(STEAM_ID, APP_ID);

    expect(resultado).toEqual({
      dados: {
        idExterno: APP_ID,
        minutosJogados: 550,
        ultimaVezJogadoEm: new Date('2026-02-22T17:24:41Z'),
        conquistasTotal: 3,
        conquistasDesbloqueadas: 2,
        capaUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1794680/library_600x900.jpg',
      },
      conquistas: [],
      aviso: null,
    });
    expect(ctx.client.listarJogos).toHaveBeenCalledWith(STEAM_ID, { appId: APP_ID });
    expect(ctx.client.obterConquistasDoJogador).toHaveBeenCalledWith(STEAM_ID, APP_ID);
  });

  it('jogo sem conquistas: 0 de 0 e o aviso SEM_CONQUISTAS', async () => {
    const ctx = comBiblioteca();
    ctx.client.obterConquistasDoJogador.mockResolvedValue({ tipo: 'sem-conquistas' });

    const { dados, aviso } = await ctx.provider.obterJogo(STEAM_ID, APP_ID);

    expect(dados).toMatchObject({ conquistasTotal: 0, conquistasDesbloqueadas: 0 });
    expect(aviso).toBe('SEM_CONQUISTAS');
  });

  it('(SIMULADO, sem fixture real) conquistas negadas: as horas ficam, as contagens são null e o aviso é CONQUISTAS_PRIVADAS (CA-30)', async () => {
    const ctx = comBiblioteca();
    ctx.client.obterConquistasDoJogador.mockResolvedValue({ tipo: 'negado' });

    const { dados, aviso } = await ctx.provider.obterJogo(STEAM_ID, APP_ID);

    expect(dados).toMatchObject({
      minutosJogados: 550,
      conquistasTotal: null,
      conquistasDesbloqueadas: null,
    });
    expect(aviso).toBe('CONQUISTAS_PRIVADAS');
  });

  it('nunca jogado: 0 minutos e última vez jogado null', async () => {
    const ctx = comBiblioteca([
      { ...jogoDaBiblioteca, minutosJogados: 0, ultimaVezJogadoEm: null },
    ]);
    ctx.client.obterConquistasDoJogador.mockResolvedValue({ tipo: 'sem-conquistas' });

    const { dados } = await ctx.provider.obterJogo(STEAM_ID, APP_ID);

    expect(dados).toMatchObject({ minutosJogados: 0, ultimaVezJogadoEm: null });
  });

  it('(SIMULADO, sem fixture real) biblioteca privada → PerfilPrivadoError, e as conquistas nem são consultadas (CA-30)', async () => {
    const ctx = montar();
    ctx.client.listarJogos.mockResolvedValue({ privada: true, total: 0, jogos: [] });

    await expect(ctx.provider.obterJogo(STEAM_ID, APP_ID)).rejects.toBeInstanceOf(
      PerfilPrivadoError,
    );
    expect(ctx.client.obterConquistasDoJogador).not.toHaveBeenCalled();
  });

  it.each([
    ['biblioteca sem o appid (a Steam devolve game_count 0)', []],
    ['a Steam devolveu outro appid', [{ ...jogoDaBiblioteca, appid: '999' }]],
  ])(
    '%s → PlataformaItemNaoEncontradoError, sem consultar conquistas (CA-27)',
    async (_nome, jogos) => {
      const ctx = comBiblioteca(jogos);

      const erro: unknown = await ctx.provider.obterJogo(STEAM_ID, APP_ID).catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(PlataformaItemNaoEncontradoError);
      expect(erro).toMatchObject({ code: 'PLATAFORMA_ITEM_NAO_ENCONTRADO' });
      expect(ctx.client.obterConquistasDoJogador).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['biblioteca indisponível', 'listarJogos', new PlataformaIndisponivelError()],
    ['biblioteca no limite', 'listarJogos', new PlataformaLimiteError()],
    ['conquistas indisponíveis', 'obterConquistasDoJogador', new PlataformaIndisponivelError()],
    ['conquistas no limite', 'obterConquistasDoJogador', new PlataformaLimiteError()],
  ] as const)(
    'falha da Steam (%s) sobe como está: quem grava decide não gravar nada (CA-30)',
    async (_nome, quem, erro) => {
      const ctx = comBiblioteca();
      ctx.client.obterConquistasDoJogador.mockResolvedValue({ tipo: 'sem-conquistas' });
      ctx.client[quem].mockRejectedValue(erro);

      await expect(ctx.provider.obterJogo(STEAM_ID, APP_ID)).rejects.toBe(erro);
    },
  );

  it('com o SteamClient de verdade e as respostas reais: contagens do fixture de conquistas', async () => {
    const fixture = (nome: string) => {
      const { status, body } = JSON.parse(
        readFileSync(join(__dirname, '__fixtures__', nome), 'utf8'),
      ) as { status: number; body: unknown };
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=UTF-8' },
      });
    };
    jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('GetOwnedGames')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              response: {
                game_count: 1,
                games: [
                  {
                    appid: 1794680,
                    name: 'Vampire Survivors',
                    playtime_forever: 550,
                    rtime_last_played: 1771783481,
                  },
                ],
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(fixture('player-achievements.com-conquistas.json'));
    });
    const config = { get: () => 'ABCDEF0123456789ABCDEF0123456789' } as unknown as ConfigService<
      EnvironmentVariables,
      true
    >;
    const provider = new SteamProvider(new SteamClient(config), {} as SteamOpenId);

    const { dados, aviso } = await provider.obterJogo(STEAM_ID, APP_ID);
    jest.restoreAllMocks();

    expect(dados).toMatchObject({
      minutosJogados: 550,
      conquistasTotal: 6,
      conquistasDesbloqueadas: 3,
    });
    expect(aviso).toBeNull();
  });

  it.todo(
    'conquistas negadas REAIS no obterJogo: troque o mock "negado" pelo fixture player-achievements.negado.json. Comando: node apps/api/scripts/capturar-fixtures-steam.cjs detalhes-privados',
  );
});

describe('SteamProvider.obterDetalhe (etapa 4)', () => {
  const APP = '1794680';
  const jogador: SteamConquistasDoJogador = {
    tipo: 'ok',
    nomeDoJogo: 'Jogo',
    conquistas: [
      {
        id: 'A',
        desbloqueada: true,
        desbloqueadaEm: new Date('2026-02-17T18:06:22Z'),
        nome: 'Nome do jogador A',
        descricao: 'Descrição A',
      },
      { id: 'B', desbloqueada: false, desbloqueadaEm: null, nome: null, descricao: null },
    ],
  };
  const schema: SteamConquistaDoSchema[] = [
    {
      id: 'A',
      nome: 'Asas',
      descricao: 'Alcance o nível 5.',
      oculta: false,
      iconeUrl: 'https://steamcdn-a.akamaihd.net/a.jpg',
      iconeCinzaUrl: 'https://steamcdn-a.akamaihd.net/a-cinza.jpg',
    },
    {
      id: 'B',
      nome: 'Segredo',
      descricao: null,
      oculta: true,
      iconeUrl: 'https://steamcdn-a.akamaihd.net/b.jpg',
      iconeCinzaUrl: 'https://steamcdn-a.akamaihd.net/b-cinza.jpg',
    },
  ];
  const COM_HORAS = { comHoras: true, ignorarCache: false };
  const SEM_HORAS = { comHoras: false, ignorarCache: false };

  function pronto() {
    const ctx = montar();
    ctx.client.listarJogos.mockResolvedValue({
      privada: false,
      total: 1,
      jogos: [
        {
          appid: APP,
          nome: 'Jogo',
          minutosJogados: 550,
          ultimaVezJogadoEm: new Date('2026-02-22T17:24:41Z'),
        },
      ],
    });
    ctx.client.obterConquistasDoJogador.mockResolvedValue(jogador);
    ctx.client.obterSchema.mockResolvedValue(schema);
    ctx.client.obterPercentuaisGlobais.mockResolvedValue(new Map([['A', 40.7]]));
    return ctx;
  }

  it('junta jogador, schema e raridade: nome, descrição, ícone (cinza se bloqueada), data e percentual (CA-43)', async () => {
    const { provider } = pronto();

    const detalhe = await provider.obterDetalhe(STEAM_ID, APP, COM_HORAS);

    expect(detalhe.aviso).toBeNull();
    expect(detalhe.conquistasTotal).toBe(2);
    expect(detalhe.conquistasDesbloqueadas).toBe(1);
    expect(detalhe.horas).toMatchObject({ minutosJogados: 550 });
    expect(detalhe.conquistas).toEqual([
      {
        id: 'A',
        nome: 'Asas',
        descricao: 'Alcance o nível 5.',
        oculta: false,
        desbloqueada: true,
        desbloqueadaEm: '2026-02-17T18:06:22.000Z',
        iconeUrl: 'https://steamcdn-a.akamaihd.net/a.jpg',
        raridadePercentual: 40.7,
      },
      {
        id: 'B',
        nome: 'Segredo',
        descricao: null,
        oculta: true,
        desbloqueada: false,
        desbloqueadaEm: null,
        iconeUrl: 'https://steamcdn-a.akamaihd.net/b-cinza.jpg',
        raridadePercentual: null,
      },
    ]);
  });

  it('sem horas pedidas: não consulta a biblioteca e `horas` vem null (CA-44)', async () => {
    const { provider, client } = pronto();

    const detalhe = await provider.obterDetalhe(STEAM_ID, APP, SEM_HORAS);

    expect(client.listarJogos).not.toHaveBeenCalled();
    expect(detalhe.horas).toBeNull();
    expect(detalhe.conquistas).toHaveLength(2);
  });

  it('falha só do schema: continua, com o nome do jogador (ou o id) e sem ícone (CA-50)', async () => {
    const { provider, client } = pronto();
    client.obterSchema.mockRejectedValue(new PlataformaIndisponivelError());

    const detalhe = await provider.obterDetalhe(STEAM_ID, APP, SEM_HORAS);

    expect(detalhe.aviso).toBeNull();
    expect(detalhe.conquistas.map((c) => c.nome)).toEqual(['Nome do jogador A', 'B']);
    expect(detalhe.conquistas.every((c) => c.iconeUrl === null && !c.oculta)).toBe(true);
    expect(detalhe.conquistas[0]?.raridadePercentual).toBe(40.7);
  });

  it('falha só dos percentuais: continua, com a raridade null (CA-50)', async () => {
    const { provider, client } = pronto();
    client.obterPercentuaisGlobais.mockRejectedValue(new PlataformaLimiteError());

    const detalhe = await provider.obterDetalhe(STEAM_ID, APP, SEM_HORAS);

    expect(detalhe.conquistas.map((c) => c.raridadePercentual)).toEqual([null, null]);
    expect(detalhe.conquistas[0]?.nome).toBe('Asas');
  });

  it('ícone fora de um host da Steam é descartado', async () => {
    const { provider, client } = pronto();
    client.obterSchema.mockResolvedValue([
      {
        ...schema[0]!,
        iconeUrl: 'https://exemplo.invalid/a.jpg',
        iconeCinzaUrl: 'http://x.steamstatic.com/a.jpg',
      },
    ]);

    const detalhe = await provider.obterDetalhe(STEAM_ID, APP, SEM_HORAS);

    expect(detalhe.conquistas[0]?.iconeUrl).toBeNull();
  });

  it('(SIMULADO, sem fixture real) conquistas negadas: aviso CONQUISTAS_PRIVADAS, horas ficam, contagens null e nada de schema (CA-47)', async () => {
    const { provider, client } = pronto();
    client.obterConquistasDoJogador.mockResolvedValue({ tipo: 'negado' });

    const detalhe = await provider.obterDetalhe(STEAM_ID, APP, COM_HORAS);

    expect(detalhe).toMatchObject({
      aviso: 'CONQUISTAS_PRIVADAS',
      conquistasTotal: null,
      conquistasDesbloqueadas: null,
      conquistas: [],
      horas: { minutosJogados: 550 },
    });
    expect(client.obterSchema).not.toHaveBeenCalled();
  });

  it('jogo sem conquistas (400 "no stats", fixture real): SEM_CONQUISTAS, 0 de 0, sem schema (CA-48)', async () => {
    const { provider, client } = pronto();
    client.obterConquistasDoJogador.mockResolvedValue({ tipo: 'sem-conquistas' });

    const detalhe = await provider.obterDetalhe(STEAM_ID, APP, SEM_HORAS);

    expect(detalhe).toMatchObject({
      aviso: 'SEM_CONQUISTAS',
      conquistasTotal: 0,
      conquistasDesbloqueadas: 0,
      conquistas: [],
    });
    expect(client.obterSchema).not.toHaveBeenCalled();
  });

  it('(SIMULADO, sem fixture real) biblioteca privada com horas pedidas → PerfilPrivadoError; item fora dela → não encontrado', async () => {
    const { provider, client } = pronto();
    client.listarJogos.mockResolvedValueOnce({ privada: true, total: 0, jogos: [] });
    await expect(provider.obterDetalhe(STEAM_ID, APP, COM_HORAS)).rejects.toBeInstanceOf(
      PerfilPrivadoError,
    );

    client.listarJogos.mockResolvedValueOnce({ privada: false, total: 0, jogos: [] });
    await expect(provider.obterDetalhe(STEAM_ID, APP, COM_HORAS)).rejects.toBeInstanceOf(
      PlataformaItemNaoEncontradoError,
    );
    expect(client.obterConquistasDoJogador).not.toHaveBeenCalled();
  });

  it('falha da plataforma na biblioteca ou nas conquistas do jogador sobe (o GET decide devolver o gravado)', async () => {
    const { provider, client } = pronto();
    const erro = new PlataformaIndisponivelError();
    client.listarJogos.mockRejectedValueOnce(erro);
    await expect(provider.obterDetalhe(STEAM_ID, APP, COM_HORAS)).rejects.toBe(erro);

    client.obterConquistasDoJogador.mockRejectedValueOnce(erro);
    await expect(provider.obterDetalhe(STEAM_ID, APP, SEM_HORAS)).rejects.toBe(erro);
  });

  it('cache: duas aberturas seguidas não chamam a Steam de novo; "Atualizar" refaz só as conquistas do jogador', async () => {
    const { provider, client } = pronto();

    await provider.obterDetalhe(STEAM_ID, APP, SEM_HORAS);
    await provider.obterDetalhe(STEAM_ID, APP, SEM_HORAS);
    expect(client.obterConquistasDoJogador).toHaveBeenCalledTimes(1);
    expect(client.obterSchema).toHaveBeenCalledTimes(1);
    expect(client.obterPercentuaisGlobais).toHaveBeenCalledTimes(1);

    await provider.obterDetalhe(STEAM_ID, APP, { comHoras: false, ignorarCache: true });
    expect(client.obterConquistasDoJogador).toHaveBeenCalledTimes(2);
    expect(client.obterSchema).toHaveBeenCalledTimes(1);
    expect(client.obterPercentuaisGlobais).toHaveBeenCalledTimes(1);
  });

  it('cache: o schema e os percentuais são por jogo, e o do jogador é por SteamID', async () => {
    const { provider, client } = pronto();

    await provider.obterDetalhe(STEAM_ID, APP, SEM_HORAS);
    await provider.obterDetalhe('76561190000000001', APP, SEM_HORAS);
    await provider.obterDetalhe(STEAM_ID, '2076040', SEM_HORAS);

    expect(client.obterConquistasDoJogador).toHaveBeenCalledTimes(3);
    expect(client.obterSchema).toHaveBeenCalledTimes(2);
  });

  it('erro nas conquistas do jogador não fica no cache', async () => {
    const { provider, client } = pronto();
    client.obterConquistasDoJogador.mockRejectedValueOnce(new PlataformaIndisponivelError());

    await expect(provider.obterDetalhe(STEAM_ID, APP, SEM_HORAS)).rejects.toBeInstanceOf(
      PlataformaIndisponivelError,
    );
    await expect(provider.obterDetalhe(STEAM_ID, APP, SEM_HORAS)).resolves.toMatchObject({
      aviso: null,
    });
  });

  it('com o SteamClient de verdade e as respostas REAIS: percentual em texto vira número e a oculta vem sem descrição', async () => {
    const resposta = (nome: string) => {
      const { status, body } = JSON.parse(
        readFileSync(join(__dirname, '__fixtures__', nome), 'utf8'),
      ) as { status: number; body: unknown };
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=UTF-8' },
      });
    };
    let oculta = false;
    jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('GetPlayerAchievements')) {
        return Promise.resolve(
          resposta(
            oculta ? 'player-achievements.oculta.json' : 'player-achievements.com-conquistas.json',
          ),
        );
      }
      if (url.includes('GetSchemaForGame')) {
        return Promise.resolve(
          resposta(oculta ? 'schema.oculta.json' : 'schema.com-conquistas.json'),
        );
      }
      return Promise.resolve(resposta('global-percentages.com-conquistas.json'));
    });
    const config = { get: () => 'ABCDEF0123456789ABCDEF0123456789' } as unknown as ConfigService<
      EnvironmentVariables,
      true
    >;
    const provider = new SteamProvider(new SteamClient(config), {} as SteamOpenId);

    const normal = await provider.obterDetalhe(STEAM_ID, APP, SEM_HORAS);
    oculta = true;
    const escondida = await provider.obterDetalhe(STEAM_ID, '730', SEM_HORAS);
    jest.restoreAllMocks();

    expect(normal.conquistas).toHaveLength(6);
    expect(normal.conquistas.find((c) => c.id === 'ReachLV5')?.raridadePercentual).toBe(97.2);
    expect(normal.conquistas.every((c) => c.iconeUrl?.startsWith('https://') ?? false)).toBe(true);
    expect(escondida.conquistas).toHaveLength(1);
    expect(escondida.conquistas[0]).toMatchObject({
      id: 'PLAY_CS2',
      oculta: true,
      descricao: null,
      raridadePercentual: null,
    });
  });
});

describe('anoDaCriacao e statusDaSteam', () => {
  it.each([
    [1300000000, 2011],
    [0, null],
    [-1, null],
    [null, null],
    [undefined, null],
    [Number.NaN, null],
  ])('anoDaCriacao(%p) = %p', (entrada, esperado) => {
    expect(anoDaCriacao(entrada)).toBe(esperado);
  });

  it.each([
    [0, null, 'offline'],
    [1, null, 'online'],
    [3, null, 'online'],
    [0, 'Celeste', 'jogando'],
    [null, null, null],
    [undefined, undefined, null],
  ])('statusDaSteam(%p, %p) = %p', (estado, jogo, esperado) => {
    expect(statusDaSteam(estado, jogo)).toBe(esperado);
  });
});
