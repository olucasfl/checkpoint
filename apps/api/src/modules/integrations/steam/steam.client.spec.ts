import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { type EnvironmentVariables } from '../../../config/env.validation';
import {
  IdExternoInvalidoError,
  PlataformaIndisponivelError,
  PlataformaLimiteError,
} from '../providers/plataforma-errors';
import { SteamClient } from './steam.client';

// Valores sintéticos e óbvios (RULES.md §8): nem a chave nem o SteamID são reais.
const KEY = 'ABCDEF0123456789ABCDEF0123456789';
const STEAM_ID = '76561190000000000';
const APP_ID = '1794680';

interface Fixture {
  status: number;
  body: unknown;
}

function fixture(name: string): Fixture {
  return JSON.parse(readFileSync(join(__dirname, '__fixtures__', name), 'utf8')) as Fixture;
}

/** Uma `Response` como a Steam a manda: JSON, ou HTML quando o fixture guarda `__texto` (os erros). */
function resposta({ status, body }: Fixture): Response {
  const texto = (body as { __texto?: string } | null)?.__texto;
  return texto === undefined
    ? new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=UTF-8' },
      })
    : new Response(texto, { status, headers: { 'content-type': 'text/html' } });
}

function html(status: number, texto = '<html><body>erro</body></html>'): Response {
  return new Response(texto, { status, headers: { 'content-type': 'text/html' } });
}

describe('SteamClient', () => {
  let fetchMock: jest.SpyInstance;
  let logCalls: string[];
  let client: SteamClient;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
    logCalls = [];
    for (const method of ['error', 'warn', 'log', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, method).mockImplementation((...args: unknown[]) => {
        logCalls.push(args.map(String).join(' '));
      });
    }
    const config = { get: () => KEY } as unknown as ConfigService<EnvironmentVariables, true>;
    client = new SteamClient(config);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** A chave viaja na query string: nenhum log pode ter a URL, a chave nem o ID (CA-03, CA-58). */
  function expectLogsSemSegredo(): void {
    const impresso = logCalls.join('\n');
    expect(impresso).not.toContain(KEY);
    expect(impresso).not.toContain('key=');
    expect(impresso).not.toContain('api.steampowered.com');
    expect(impresso).not.toContain(STEAM_ID);
  }

  describe('respostas reais (fixtures)', () => {
    it('obterPerfil: perfil público, com os campos que a API usa', async () => {
      fetchMock.mockResolvedValueOnce(resposta(fixture('player-summaries.publico.json')));

      const perfil = await client.obterPerfil(STEAM_ID);

      expect(perfil).toEqual({
        visibilidade: 3,
        nome: 'Jogador Sintetico',
        avatarUrl: expect.stringMatching(/^https:\/\/avatars\.steamstatic\.com\//) as string,
        perfilUrl: expect.stringContaining('steamcommunity.com/profiles/') as string,
      });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/ISteamUser/GetPlayerSummaries/v2/');
      expect(url).toContain(`steamids=${STEAM_ID}`);
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('obterPerfil: ID que a Steam não conhece devolve null', async () => {
      fetchMock.mockResolvedValueOnce(
        resposta({ status: 200, body: { response: { players: [] } } }),
      );

      await expect(client.obterPerfil(STEAM_ID)).resolves.toBeNull();
    });

    it('listarJogos: biblioteca pública; "nunca jogado" (rtime 0) vira null (CA-64)', async () => {
      fetchMock.mockResolvedValueOnce(resposta(fixture('owned-games.publico.json')));

      const biblioteca = await client.listarJogos(STEAM_ID);

      expect(biblioteca.privada).toBe(false);
      expect(biblioteca.total).toBe(6);
      expect(biblioteca.jogos).toHaveLength(6);
      const nuncaJogado = biblioteca.jogos.find((jogo) => jogo.minutosJogados === 0);
      expect(nuncaJogado).toMatchObject({ ultimaVezJogadoEm: null });
      const jogado = biblioteca.jogos.find((jogo) => jogo.minutosJogados > 0);
      expect(jogado?.ultimaVezJogadoEm).toBeInstanceOf(Date);
      expect(typeof jogado?.appid).toBe('string');
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('include_appinfo=1');
      expect(url).toContain('include_played_free_games=1');
    });

    it('listarJogos com appId manda o filtro em input_json e um appid fora da biblioteca volta vazio', async () => {
      fetchMock.mockResolvedValueOnce(
        resposta({ status: 200, body: { response: { game_count: 0 } } }),
      );

      const biblioteca = await client.listarJogos(STEAM_ID, { appId: APP_ID });

      expect(biblioteca).toEqual({ privada: false, total: 0, jogos: [] });
      const [url] = fetchMock.mock.calls[0] as [string];
      const input = JSON.parse(new URL(url).searchParams.get('input_json') ?? '{}') as {
        appids_filter: number[];
        steamid: string;
      };
      expect(input.appids_filter).toEqual([Number(APP_ID)]);
      expect(input.steamid).toBe(STEAM_ID);
    });

    it('obterConquistasDoJogador: com conquistas, separando desbloqueadas das que faltam', async () => {
      fetchMock.mockResolvedValueOnce(resposta(fixture('player-achievements.com-conquistas.json')));

      const resultado = await client.obterConquistasDoJogador(STEAM_ID, APP_ID);

      expect(resultado.tipo).toBe('ok');
      if (resultado.tipo !== 'ok') {
        return;
      }
      expect(resultado.nomeDoJogo).toBe('Vampire Survivors');
      expect(resultado.conquistas).toHaveLength(6);
      const desbloqueadas = resultado.conquistas.filter((c) => c.desbloqueada);
      expect(desbloqueadas).toHaveLength(3);
      expect(desbloqueadas.every((c) => c.desbloqueadaEm instanceof Date)).toBe(true);
      const faltam = resultado.conquistas.filter((c) => !c.desbloqueada);
      expect(faltam.every((c) => c.desbloqueadaEm === null)).toBe(true);
      expect(resultado.conquistas[0]).toMatchObject({ id: 'ReachLV5', nome: 'Asas' });
    });

    it('obterConquistasDoJogador: jogo sem conquistas (400 "no stats") é um estado, não um erro', async () => {
      fetchMock.mockResolvedValueOnce(resposta(fixture('player-achievements.sem-conquistas.json')));

      await expect(client.obterConquistasDoJogador(STEAM_ID, '2076040')).resolves.toEqual({
        tipo: 'sem-conquistas',
      });
    });

    it('conquista oculta: a descrição vazia vira null e o schema marca oculta (CA-50)', async () => {
      fetchMock
        .mockResolvedValueOnce(resposta(fixture('player-achievements.oculta.json')))
        .mockResolvedValueOnce(resposta(fixture('schema.oculta.json')));

      const jogador = await client.obterConquistasDoJogador(STEAM_ID, '730');
      const schema = await client.obterSchema('730');

      expect(jogador.tipo === 'ok' && jogador.conquistas[0]?.descricao).toBeNull();
      expect(schema).toEqual([
        expect.objectContaining({ id: 'PLAY_CS2', oculta: true, descricao: null }),
      ]);
    });

    it('obterSchema: nome, descrição e ícones; jogo sem conquistas devolve lista vazia', async () => {
      fetchMock
        .mockResolvedValueOnce(resposta(fixture('schema.com-conquistas.json')))
        .mockResolvedValueOnce(resposta(fixture('schema.sem-conquistas.json')));

      const com = await client.obterSchema(APP_ID);
      const sem = await client.obterSchema('2076040');

      expect(com.length).toBeGreaterThan(0);
      expect(com[0]).toMatchObject({
        oculta: false,
        nome: expect.any(String) as string,
        iconeUrl: expect.stringMatching(/^https:\/\//) as string,
        iconeCinzaUrl: expect.stringMatching(/^https:\/\//) as string,
      });
      expect(sem).toEqual([]);
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('l=brazilian');
    });

    it('obterPercentuaisGlobais: o percent (texto) vira número com 1 casa, sem mandar a chave (CA-64)', async () => {
      fetchMock.mockResolvedValueOnce(resposta(fixture('global-percentages.com-conquistas.json')));

      const percentuais = await client.obterPercentuaisGlobais(APP_ID);

      expect(percentuais.size).toBe(6);
      for (const valor of percentuais.values()) {
        expect(typeof valor).toBe('number');
      }
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).not.toContain('key=');
      expect(url).toContain(`gameid=${APP_ID}`);
    });

    it('obterPercentuaisGlobais: "40.7" → 40,7; número → 1 casa; texto que não é número é ignorado', async () => {
      fetchMock.mockResolvedValueOnce(
        resposta({
          status: 200,
          body: {
            achievementpercentages: {
              achievements: [
                { name: 'A', percent: '40.7' },
                { name: 'B', percent: 12.34 },
                { name: 'C', percent: 'abc' },
              ],
            },
          },
        }),
      );

      const percentuais = await client.obterPercentuaisGlobais(APP_ID);

      expect(Object.fromEntries(percentuais)).toEqual({ A: 40.7, B: 12.3 });
    });
  });

  describe('falhas da Steam (CA-03)', () => {
    it('429 → PlataformaLimiteError (PLATAFORMA_LIMITE)', async () => {
      fetchMock.mockResolvedValueOnce(html(429));

      const erro: unknown = await client.obterPerfil(STEAM_ID).catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(PlataformaLimiteError);
      expect(erro).toMatchObject({ code: 'PLATAFORMA_LIMITE' });
      expectLogsSemSegredo();
    });

    it('401 (o corpo real é HTML "Unauthorized") → indisponível, com um error de "chave recusada" no log', async () => {
      fetchMock.mockResolvedValueOnce(resposta(fixture('erro-401.chave-invalida.json')));

      const erro: unknown = await client.listarJogos(STEAM_ID).catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(PlataformaIndisponivelError);
      expect(erro).toMatchObject({ code: 'PLATAFORMA_INDISPONIVEL' });
      const errorSpy = jest.mocked(Logger.prototype.error);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('recusou a chave: HTTP 401'));
      expectLogsSemSegredo();
    });

    it.each([
      ['403 fora das conquistas', () => html(403)],
      ['500', () => html(500)],
      ['502', () => html(502)],
      ['400 (pedido malformado, em HTML)', () => html(400)],
      ['200 sem content-type JSON', () => html(200, 'ok')],
      [
        '200 com JSON inválido',
        () =>
          new Response('{quebrado', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ],
      [
        '200 com JSON em outro formato',
        () =>
          new Response(JSON.stringify({ outra: 'coisa' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ],
    ])('%s → PlataformaIndisponivelError, sem ler HTML como JSON', async (_nome, criar) => {
      fetchMock.mockResolvedValueOnce(criar());

      const erro: unknown = await client.listarJogos(STEAM_ID).catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(PlataformaIndisponivelError);
      expect(erro).toMatchObject({ code: 'PLATAFORMA_INDISPONIVEL' });
      expectLogsSemSegredo();
    });

    it.each([
      ['timeout', Object.assign(new Error('demorou'), { name: 'TimeoutError' })],
      ['falha de rede', new TypeError('fetch failed')],
    ])('%s → PlataformaIndisponivelError; o log tem só o tipo do erro', async (_nome, falha) => {
      fetchMock.mockRejectedValueOnce(falha);

      const erro: unknown = await client.obterSchema(APP_ID).catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(PlataformaIndisponivelError);
      expect(logCalls.join('\n')).toContain('sem resposta: ');
      expectLogsSemSegredo();
    });

    it('a mensagem do erro que sobe não tem a chave nem a URL', async () => {
      fetchMock.mockResolvedValueOnce(html(500));

      const erro = (await client.obterPerfil(STEAM_ID).catch((e: unknown) => e)) as Error;

      expect(`${erro.name} ${erro.message}`).not.toContain(KEY);
      expect(erro.message).not.toContain('steampowered');
    });

    it('(SIMULADO, sem fixture real) conquistas: 403 → "negado"', async () => {
      fetchMock.mockResolvedValueOnce(html(403));

      await expect(client.obterConquistasDoJogador(STEAM_ID, APP_ID)).resolves.toEqual({
        tipo: 'negado',
      });
    });

    it('(SIMULADO, sem fixture real) conquistas: 200 com success false e outra mensagem → "negado"', async () => {
      fetchMock.mockResolvedValueOnce(
        resposta({
          status: 200,
          body: { playerstats: { error: 'Profile is not public', success: false } },
        }),
      );

      await expect(client.obterConquistasDoJogador(STEAM_ID, APP_ID)).resolves.toEqual({
        tipo: 'negado',
      });
    });

    it('(SIMULADO, sem fixture real) listarJogos: resposta SEM game_count é biblioteca privada; com game_count 0 é pública e vazia', async () => {
      fetchMock.mockResolvedValueOnce(resposta({ status: 200, body: { response: {} } }));
      fetchMock.mockResolvedValueOnce(
        resposta({ status: 200, body: { response: { game_count: 0 } } }),
      );

      await expect(client.listarJogos(STEAM_ID)).resolves.toEqual({
        privada: true,
        total: 0,
        jogos: [],
      });
      await expect(client.listarJogos(STEAM_ID)).resolves.toEqual({
        privada: false,
        total: 0,
        jogos: [],
      });
    });

    it('o 400 "Requested app has no stats" NÃO é "negado": é jogo sem conquistas (fixture REAL)', async () => {
      fetchMock.mockResolvedValueOnce(resposta(fixture('player-achievements.sem-conquistas.json')));

      await expect(client.obterConquistasDoJogador(STEAM_ID, '2076040')).resolves.toEqual({
        tipo: 'sem-conquistas',
      });
    });

    it('conquistas: 400 em HTML (pedido malformado) não é "sem conquistas": é indisponível', async () => {
      fetchMock.mockResolvedValueOnce(html(400));

      await expect(client.obterConquistasDoJogador(STEAM_ID, APP_ID)).rejects.toBeInstanceOf(
        PlataformaIndisponivelError,
      );
    });
  });

  describe('validação do ID antes de chamar (CA-64)', () => {
    const steamIdsInvalidos = [
      '',
      'abc',
      '7656119000000000', // 16 dígitos
      '765611900000000000', // 18 dígitos
      '12345678901234567', // 17 dígitos, sem o prefixo 7656
      '76561190000000000 ',
      "76561190000000000'; drop",
    ];
    const appIdsInvalidos = ['', '12a', '1; drop', '-1', '12345678901', ' 730'];

    it.each(steamIdsInvalidos)('SteamID %j é erro de validação e não chama a Steam', async (id) => {
      const chamadas = [
        () => client.obterPerfil(id),
        () => client.listarJogos(id),
        () => client.obterConquistasDoJogador(id, APP_ID),
      ];

      for (const chamar of chamadas) {
        await expect(chamar()).rejects.toMatchObject({
          name: 'IdExternoInvalidoError',
          campo: 'steamId',
        });
        await expect(chamar()).rejects.toBeInstanceOf(IdExternoInvalidoError);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(appIdsInvalidos)('appid %j é erro de validação e não chama a Steam', async (id) => {
      const chamadas = [
        () => client.listarJogos(STEAM_ID, { appId: id }),
        () => client.obterConquistasDoJogador(STEAM_ID, id),
        () => client.obterSchema(id),
        () => client.obterPercentuaisGlobais(id),
      ];

      for (const chamar of chamadas) {
        await expect(chamar()).rejects.toMatchObject({
          name: 'IdExternoInvalidoError',
          campo: 'appId',
        });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('um ID malformado nunca vira "perfil privado"', async () => {
      const erro = await client.listarJogos('abc').catch((e: unknown) => e);

      expect(erro).not.toMatchObject({ code: 'PLATAFORMA_PERFIL_PRIVADO' });
      expect(erro).toBeInstanceOf(IdExternoInvalidoError);
    });
  });

  // Fixtures que dependem de uma captura real ainda pendente (CA-63). Os testes vêm junto do fixture.
  // Casos SEM fixture real (CA-63). Os testes acima que os cobrem estão nomeados "SIMULADO". Cada um se fecha
  // rodando UM comando (gasta cota da chave: uma captura por execução) e trocando a resposta simulada pelo fixture.
  describe('pendentes de fixture real (CA-63)', () => {
    it.todo(
      'perfil privado REAL: GetPlayerSummaries com visibilidade ≠ 3 e GetOwnedGames sem game_count. Deixe "Meu perfil" = Privado no site da Steam, espere alguns minutos e rode: node apps/api/scripts/capturar-fixtures-steam.cjs privado',
    );
    it.todo(
      'conquistas negadas REAIS: GetPlayerAchievements com "Detalhes do jogo" privados (403 ou success:false?). Deixe "Meu perfil" = Público e "Detalhes do jogo" = Privado e rode: node apps/api/scripts/capturar-fixtures-steam.cjs detalhes-privados (o script diz se é 403; se não for, ajuste obterConquistasDoJogador e os CA-30/CA-47)',
    );
    it.todo(
      'biblioteca vazia REAL (game_count 0): precisa de uma conta pública sem jogos em STEAM_TEST_ID_VAZIO no .env e rode: node apps/api/scripts/capturar-fixtures-steam.cjs vazio',
    );
  });
});
