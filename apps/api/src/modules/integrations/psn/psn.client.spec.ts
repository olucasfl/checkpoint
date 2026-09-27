import { Logger } from '@nestjs/common';
import {
  CredencialInvalidaError,
  IdExternoInvalidoError,
  PlataformaIndisponivelError,
  PlataformaLimiteError,
  PlataformaReautenticarError,
} from '../providers/plataforma-errors';
import { PSN_REQUEST_TIMEOUT_MS } from '../integrations.constants';
import {
  ACCESS_SINTETICO,
  NPSSO_SINTETICO,
  REFRESH_SINTETICO,
  conjuntoDoTitulo,
  definicoesDeTrofeus,
  ganhosDeTrofeus,
  jogadosDuasVersoes,
  perfil,
  resumoDeTrofeus,
  tokensSinteticos,
} from './__fixtures__/respostas';
import { PsnClient, minutosDeDuracaoIso } from './psn.client';

/** O pacote falso: o `psn-api` de verdade nunca é carregado nos testes. */
type Pacote = Record<string, jest.Mock>;

class ClienteDeTeste extends PsnClient {
  constructor(private readonly falso: Pacote) {
    super();
  }
  protected override carregarPacote(): never {
    return Promise.resolve(this.falso) as never;
  }
}

const SEGREDO = 'SEGREDO_SINTETICO_QUE_O_PACOTE_EMBUTE_NA_MENSAGEM';

let avisos: string[];

beforeEach(() => {
  avisos = [];
  jest.spyOn(Logger.prototype, 'warn').mockImplementation((mensagem: unknown) => {
    avisos.push(String(mensagem));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function cliente(pacote: Pacote) {
  return new ClienteDeTeste(pacote);
}

async function erroDe(promessa: Promise<unknown>): Promise<Error> {
  try {
    await promessa;
  } catch (erro) {
    return erro as Error;
  }
  throw new Error('esperava um erro');
}

describe('minutosDeDuracaoIso (CA-08)', () => {
  it.each([
    ['PT228H56M33S', 13_736],
    ['PT0S', 0],
    ['PT45M', 45],
    ['P1DT2H', 1_560],
    ['PT59S', 0],
    ['PT1H0.5S', 60],
  ])('%s → %i min', (entrada, minutos) => {
    expect(minutosDeDuracaoIso(entrada)).toBe(minutos);
  });

  it.each([undefined, null, 42, '', 'lixo', '228 horas'])(
    '%j vale 0 (não quebra a lista)',
    (valor) => {
      expect(minutosDeDuracaoIso(valor)).toBe(0);
    },
  );
});

describe('PsnClient — vínculo e tokens', () => {
  it('NPSSO → tokens: troca pelo código e devolve access, refresh e validades', async () => {
    const pacote: Pacote = {
      exchangeNpssoForAccessCode: jest.fn().mockResolvedValue('codigo'),
      exchangeAccessCodeForAuthTokens: jest.fn().mockResolvedValue(tokensSinteticos),
    };

    const tokens = await cliente(pacote).trocarNpsso(NPSSO_SINTETICO);

    expect(pacote.exchangeNpssoForAccessCode).toHaveBeenCalledWith(NPSSO_SINTETICO);
    expect(tokens).toMatchObject({
      accessToken: ACCESS_SINTETICO,
      refreshToken: REFRESH_SINTETICO,
    });
    expect(tokens.refreshExpiraEm.getTime()).toBeGreaterThan(Date.now() + 50 * 24 * 3600 * 1000);
  });

  it('NPSSO recusado (o pacote lança citando o NPSSO, ou devolve tokens vazios) → CredencialInvalidaError', async () => {
    const lanca: Pacote = {
      exchangeNpssoForAccessCode: jest
        .fn()
        .mockRejectedValue(new Error(`Is your NPSSO code valid? ${SEGREDO}`)),
    };
    const vazio: Pacote = {
      exchangeNpssoForAccessCode: jest.fn().mockResolvedValue('codigo'),
      exchangeAccessCodeForAuthTokens: jest.fn().mockResolvedValue({ accessToken: undefined }),
    };

    await expect(cliente(lanca).trocarNpsso(NPSSO_SINTETICO)).rejects.toBeInstanceOf(
      CredencialInvalidaError,
    );
    await expect(cliente(vazio).trocarNpsso(NPSSO_SINTETICO)).rejects.toBeInstanceOf(
      CredencialInvalidaError,
    );
  });

  it('refresh recusado (sem access token na resposta) → PlataformaReautenticarError', async () => {
    const pacote: Pacote = {
      exchangeRefreshTokenForAuthTokens: jest.fn().mockResolvedValue({ accessToken: undefined }),
    };

    await expect(cliente(pacote).renovar(REFRESH_SINTETICO)).rejects.toBeInstanceOf(
      PlataformaReautenticarError,
    );
  });
});

describe('PsnClient — falhas (CA-07) [~: o formato dos erros da Sony é suposição]', () => {
  it('não responde em 8 s → PlataformaIndisponivelError (nunca pendura)', async () => {
    jest.useFakeTimers();
    const pacote: Pacote = {
      getUserTrophyProfileSummary: jest.fn(() => new Promise(() => undefined)),
    };

    const promessa = erroDe(cliente(pacote).resumoDeTrofeus(ACCESS_SINTETICO));
    await jest.advanceTimersByTimeAsync(PSN_REQUEST_TIMEOUT_MS + 1);

    expect(await promessa).toBeInstanceOf(PlataformaIndisponivelError);
  });

  it.each([
    ['401 do pacote', 'Unauthorized 401', PlataformaReautenticarError],
    ['token expirado', 'The access token is expired', PlataformaReautenticarError],
    ['429', 'Too Many Requests', PlataformaLimiteError],
    ['5xx / erro qualquer', 'Bad Gateway', PlataformaIndisponivelError],
  ])(
    '%s vira o erro de domínio certo, sem repassar a mensagem do pacote',
    async (_nome, mensagem, Classe) => {
      const pacote: Pacote = {
        getUserTrophyProfileSummary: jest
          .fn()
          .mockRejectedValue(new Error(`${mensagem} ${SEGREDO}`)),
      };

      const erro = await erroDe(cliente(pacote).resumoDeTrofeus(ACCESS_SINTETICO));

      expect(erro).toBeInstanceOf(Classe);
      expect(erro.message).not.toContain(SEGREDO);
      expect(avisos.join('\n')).not.toContain(SEGREDO);
      expect(avisos.join('\n')).not.toContain(ACCESS_SINTETICO);
    },
  );

  it('resposta sem os campos esperados → PlataformaIndisponivelError, e o log só tem o nome da chamada', async () => {
    const pacote: Pacote = {
      getUserTrophyProfileSummary: jest.fn().mockResolvedValue({ foo: 'bar' }),
    };

    await expect(cliente(pacote).resumoDeTrofeus(ACCESS_SINTETICO)).rejects.toBeInstanceOf(
      PlataformaIndisponivelError,
    );
    expect(avisos.every((linha) => linha.startsWith('PSN getUserTrophyProfileSummary'))).toBe(true);
  });

  it('falha ao carregar o pacote não derruba nada: vira PlataformaIndisponivelError na chamada', async () => {
    class SemPacote extends PsnClient {
      protected override carregarPacote(): never {
        return Promise.reject(new Error(SEGREDO)) as never;
      }
    }

    const erro = await erroDe(new SemPacote().perfil(ACCESS_SINTETICO));

    expect(erro).toBeInstanceOf(PlataformaIndisponivelError);
    expect(erro.message).not.toContain(SEGREDO);
  });
});

describe('PsnClient — leituras', () => {
  it('resumo de troféus: accountId, nível, % e contagem por tipo (em português)', async () => {
    const pacote: Pacote = {
      getUserTrophyProfileSummary: jest.fn().mockResolvedValue(resumoDeTrofeus),
    };

    await expect(cliente(pacote).resumoDeTrofeus(ACCESS_SINTETICO)).resolves.toEqual({
      accountId: '1234567890123456789',
      nivel: 312,
      progressoPercentual: 42,
      faixa: 4,
      trofeus: { platina: 3, ouro: 20, prata: 50, bronze: 100 },
    });
  });

  it('resumo com accountId não numérico → formato inesperado', async () => {
    const pacote: Pacote = {
      getUserTrophyProfileSummary: jest
        .fn()
        .mockResolvedValue({ ...resumoDeTrofeus, accountId: '../x' }),
    };

    await expect(cliente(pacote).resumoDeTrofeus(ACCESS_SINTETICO)).rejects.toBeInstanceOf(
      PlataformaIndisponivelError,
    );
  });

  it('perfil: onlineId e o avatar', async () => {
    const pacote: Pacote = { getProfileFromAccountId: jest.fn().mockResolvedValue(perfil) };

    await expect(cliente(pacote).perfil(ACCESS_SINTETICO)).resolves.toEqual({
      onlineId: 'conta_exemplo',
      avatarUrl: 'https://image.api.playstation.com/exemplo/avatar-l.png',
    });
  });

  it('jogados: um item por titleId, horas em minutos e a categoria (PS4 e PS5 do mesmo jogo são itens distintos) (CA-17)', async () => {
    const pacote: Pacote = { getUserPlayedGames: jest.fn().mockResolvedValue(jogadosDuasVersoes) };

    const jogos = await cliente(pacote).jogados(ACCESS_SINTETICO);

    expect(jogos.map((j) => [j.titleId, j.categoria, j.minutosJogados])).toEqual([
      ['PPSA01234_00', 'ps5_native_game', 13_736],
      ['CUSA01234_00', 'ps4_game', 720],
      ['PPSA05555_00', 'pspc_game', 45],
      ['CUSA09999_00', 'unknown', 0],
    ]);
    expect(jogos[0]?.ultimaVezJogadoEm).toEqual(new Date('2026-03-01T22:30:00Z'));
  });

  it('jogados: pagina até o total e não entra em laço (CA-18) [~: o teto de `limit` é suposição]', async () => {
    const pagina = (n: number, proximo: number | undefined) => ({
      titles: [
        { ...jogadosDuasVersoes.titles[0], titleId: `PPSA0000${n}_00` },
        { ...jogadosDuasVersoes.titles[1], titleId: `CUSA0000${n}_00` },
      ],
      totalItemCount: 4,
      nextOffset: proximo,
    });
    const pacote: Pacote = {
      getUserPlayedGames: jest
        .fn()
        .mockResolvedValueOnce(pagina(1, 2))
        .mockResolvedValueOnce(pagina(2, 4)),
    };

    const jogos = await cliente(pacote).jogados(ACCESS_SINTETICO);

    expect(jogos).toHaveLength(4);
    expect(pacote.getUserPlayedGames).toHaveBeenCalledTimes(2);
    expect(pacote.getUserPlayedGames?.mock.calls[1]?.[2]).toMatchObject({ offset: 2 });
  });

  it('jogados: uma resposta que nunca avança para no teto de páginas', async () => {
    const pacote: Pacote = {
      getUserPlayedGames: jest.fn().mockResolvedValue({
        titles: [jogadosDuasVersoes.titles[0]],
        totalItemCount: 99_999,
        nextOffset: 0,
      }),
    };

    await cliente(pacote).jogados(ACCESS_SINTETICO);

    expect(pacote.getUserPlayedGames).toHaveBeenCalledTimes(1);
  });

  it('conjunto de troféus do jogo: id da comunidade, serviço e contagens por tipo', async () => {
    const pacote: Pacote = {
      getUserTrophiesForSpecificTitle: jest.fn().mockResolvedValue(conjuntoDoTitulo),
    };

    await expect(
      cliente(pacote).conjuntoDeTrofeus(ACCESS_SINTETICO, 'PPSA01234_00'),
    ).resolves.toEqual({
      npCommunicationId: 'NPWR00000_00',
      servico: 'trophy2',
      definidos: { platina: 1, ouro: 1, prata: 1, bronze: 3 },
      ganhos: { platina: 0, ouro: 0, prata: 1, bronze: 2 },
    });
  });

  it('jogo sem conjunto (lista vazia ou não encontrado) → null', async () => {
    const vazio: Pacote = {
      getUserTrophiesForSpecificTitle: jest
        .fn()
        .mockResolvedValue({ titles: [{ npTitleId: 'x', trophyTitles: [] }] }),
    };
    const naoAchou: Pacote = {
      getUserTrophiesForSpecificTitle: jest.fn().mockRejectedValue(new Error('Resource not found')),
    };

    await expect(
      cliente(vazio).conjuntoDeTrofeus(ACCESS_SINTETICO, 'PPSA01234_00'),
    ).resolves.toBeNull();
    await expect(
      cliente(naoAchou).conjuntoDeTrofeus(ACCESS_SINTETICO, 'PPSA01234_00'),
    ).resolves.toBeNull();
  });

  it('definições (todas, DLC incluída, em pt-BR) e ganhos (com raridade)', async () => {
    const pacote: Pacote = {
      getTitleTrophies: jest.fn().mockResolvedValue(definicoesDeTrofeus),
      getUserTrophiesEarnedForTitle: jest.fn().mockResolvedValue(ganhosDeTrofeus),
    };
    const c = cliente(pacote);

    const definicoes = await c.definicoesDeTrofeus(ACCESS_SINTETICO, 'NPWR00000_00', 'trophy2');
    const ganhos = await c.ganhosDeTrofeus(ACCESS_SINTETICO, 'NPWR00000_00', 'trophy2');

    expect(pacote.getTitleTrophies?.mock.calls[0]?.[2]).toBe('all');
    expect(pacote.getTitleTrophies?.mock.calls[0]?.[3]).toMatchObject({
      npServiceName: 'trophy2',
      headerOverrides: { 'Accept-Language': 'pt-BR' },
    });
    expect(definicoes).toHaveLength(6);
    expect(definicoes[0]).toMatchObject({ id: 0, tipo: 'platina', oculto: false });
    expect(definicoes[4]).toMatchObject({ id: 4, oculto: true });
    expect(ganhos[1]).toMatchObject({ id: 1, ganho: false, raridade: 2, taxaPercentual: 4.8 });
    expect(ganhos[2]).toMatchObject({ ganho: true, ganhoEm: new Date('2026-02-01T10:00:00Z') });
  });

  it('accountId e titleId: só dígitos (CA-19)', () => {
    const c = cliente({});

    expect(() => c.validarAccountId('123')).not.toThrow();
    for (const ruim of ['', 'abc', '12 3', '../1', '1'.repeat(21)]) {
      expect(() => c.validarAccountId(ruim)).toThrow(IdExternoInvalidoError);
    }
  });
});
