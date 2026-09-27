import {
  CredencialInvalidaError,
  IdExternoInvalidoError,
  PlataformaItemNaoEncontradoError,
  PlataformaReautenticarError,
} from '../providers/plataforma-errors';
import { PsnProvider } from './psn.provider';
import {
  ACCESS_SINTETICO,
  ACCOUNT_ID_SINTETICO,
  NPSSO_SINTETICO,
  NP_COMM_ID,
  REFRESH_SINTETICO,
  TITLE_PS4,
  TITLE_PS5,
} from './__fixtures__/respostas';
import {
  type PsnConjuntoDeTrofeus,
  type PsnDefinicaoDeTrofeu,
  type PsnGanhoDeTrofeu,
  type PsnJogo,
} from './psn.client';

// As fixtures são SINTÉTICAS (derivadas dos tipos do psn-api): todo teste que depende do formato real é `[~]` na spec.
const CTX = { contaId: 'conta-1', nomeExibicao: 'conta_exemplo' };

const jogos: PsnJogo[] = [
  {
    titleId: TITLE_PS5,
    nome: 'Jogo Exemplo',
    categoria: 'ps5_native_game',
    minutosJogados: 600,
    ultimaVezJogadoEm: new Date('2026-03-01T22:30:00Z'),
    imagemUrl: 'https://image.api.playstation.com/exemplo/a.png',
  },
  {
    titleId: TITLE_PS4,
    nome: 'Jogo Exemplo',
    categoria: 'ps4_game',
    minutosJogados: 120,
    ultimaVezJogadoEm: null,
    imagemUrl: 'http://image.api.playstation.com/exemplo/inseguro.png',
  },
  {
    titleId: 'PPSA05555_00',
    nome: 'Jogo de PC',
    categoria: 'pspc_game',
    minutosJogados: 5,
    ultimaVezJogadoEm: null,
    imagemUrl: 'https://evil.example.com/x.png',
  },
  {
    titleId: 'CUSA09999_00',
    nome: 'Sem Categoria',
    categoria: 'unknown',
    minutosJogados: 0,
    ultimaVezJogadoEm: null,
    imagemUrl: null,
  },
];

const conjunto: PsnConjuntoDeTrofeus = {
  npCommunicationId: NP_COMM_ID,
  servico: 'trophy2',
  definidos: { platina: 1, ouro: 1, prata: 1, bronze: 3 },
  ganhos: { platina: 0, ouro: 0, prata: 1, bronze: 2 },
};

const definicoes: PsnDefinicaoDeTrofeu[] = [
  {
    id: 0,
    nome: 'Tudo Exemplo',
    descricao: 'Ganhe todos.',
    iconeUrl: 'https://psnobj.prod.dl.playstation.net/0.png',
    tipo: 'platina',
    oculto: false,
  },
  {
    id: 1,
    nome: 'Ouro Exemplo',
    descricao: 'Faça o ouro.',
    iconeUrl: 'https://psnobj.prod.dl.playstation.net/1.png',
    tipo: 'ouro',
    oculto: false,
  },
  {
    id: 2,
    nome: 'Segredo Exemplo',
    descricao: 'NÃO PODE SAIR',
    iconeUrl: 'https://psnobj.prod.dl.playstation.net/2.png',
    tipo: 'bronze',
    oculto: true,
  },
  {
    id: 3,
    nome: 'Segredo Ganho',
    descricao: 'Pode sair',
    iconeUrl: 'https://psnobj.prod.dl.playstation.net/3.png',
    tipo: 'bronze',
    oculto: true,
  },
  {
    id: 4,
    nome: 'DLC Exemplo',
    descricao: 'Do extra',
    iconeUrl: null,
    tipo: 'prata',
    oculto: false,
  },
];

const ganhos: PsnGanhoDeTrofeu[] = [
  { id: 0, ganho: false, ganhoEm: null, raridade: 0, taxaPercentual: 0.94 },
  { id: 1, ganho: false, ganhoEm: null, raridade: 2, taxaPercentual: 4.8 },
  { id: 2, ganho: false, ganhoEm: null, raridade: 1, taxaPercentual: 1.2 },
  {
    id: 3,
    ganho: true,
    ganhoEm: new Date('2026-02-03T10:00:00Z'),
    raridade: 3,
    taxaPercentual: 30,
  },
  {
    id: 4,
    ganho: true,
    ganhoEm: new Date('2026-02-04T10:00:00Z'),
    raridade: null,
    taxaPercentual: null,
  },
];

function montar() {
  const client = {
    trocarNpsso: jest.fn().mockResolvedValue({
      accessToken: ACCESS_SINTETICO,
      accessExpiraEm: new Date(Date.now() + 3_600_000),
      refreshToken: REFRESH_SINTETICO,
      refreshExpiraEm: new Date(Date.now() + 5e9),
    }),
    resumoDeTrofeus: jest.fn().mockResolvedValue({
      accountId: ACCOUNT_ID_SINTETICO,
      nivel: 312,
      progressoPercentual: 42,
      faixa: 4,
      trofeus: { platina: 3, ouro: 20, prata: 50, bronze: 100 },
    }),
    perfil: jest.fn().mockResolvedValue({
      onlineId: 'conta_exemplo',
      avatarUrl: 'https://image.api.playstation.com/a.png',
    }),
    jogados: jest.fn().mockResolvedValue(jogos),
    conjuntoDeTrofeus: jest.fn().mockResolvedValue(conjunto),
    definicoesDeTrofeus: jest.fn().mockResolvedValue(definicoes),
    ganhosDeTrofeus: jest.fn().mockResolvedValue(ganhos),
    validarAccountId: jest.fn(),
  };
  const sessao = {
    comToken: jest.fn((_conta: string, uso: (token: string) => Promise<unknown>) =>
      uso(ACCESS_SINTETICO),
    ),
  };
  const provider = new PsnProvider(client as never, sessao as never);
  return { provider, client, sessao };
}

describe('PsnProvider.vincularComCredencial', () => {
  it('troca o NPSSO e devolve o accountId, o nome e a sessão (refresh + validade); nunca o NPSSO', async () => {
    const { provider } = montar();

    const conta = await provider.vincularComCredencial(NPSSO_SINTETICO);

    expect(conta).toMatchObject({
      idExterno: ACCOUNT_ID_SINTETICO,
      nomeExibicao: 'conta_exemplo',
      sessao: { refreshToken: REFRESH_SINTETICO },
    });
    expect(JSON.stringify(conta)).not.toContain(NPSSO_SINTETICO);
  });

  it('falhar ao ler o nome não desfaz o vínculo (vira "Conta PlayStation")', async () => {
    const { provider, client } = montar();
    client.perfil.mockRejectedValue(new Error('x'));

    await expect(provider.vincularComCredencial(NPSSO_SINTETICO)).resolves.toMatchObject({
      nomeExibicao: 'Conta PlayStation',
    });
  });

  it('um token recém-emitido recusado é credencial inválida, não "conexão expirada"', async () => {
    const { provider, client } = montar();
    client.resumoDeTrofeus.mockRejectedValue(new PlataformaReautenticarError());

    await expect(provider.vincularComCredencial(NPSSO_SINTETICO)).rejects.toBeInstanceOf(
      CredencialInvalidaError,
    );
  });
});

describe('PsnProvider.listarBiblioteca (CA-17, CA-19)', () => {
  it('um item por titleId (PS4 e PS5 do mesmo jogo ficam separados), com a plataforma sugerida', async () => {
    const { provider } = montar();

    const { itens } = await provider.listarBiblioteca(ACCOUNT_ID_SINTETICO, CTX);

    expect(itens.map((i) => [i.idExterno, i.titulo, i.plataformaSugerida])).toEqual([
      [TITLE_PS5, 'Jogo Exemplo', 'PS5'],
      [TITLE_PS4, 'Jogo Exemplo', 'PS4'],
      ['PPSA05555_00', 'Jogo de PC', 'PC'],
      ['CUSA09999_00', 'Sem Categoria', null],
    ]);
    expect(itens[0]).toMatchObject({
      minutosJogados: 600,
      ultimaVezJogadoEm: new Date('2026-03-01T22:30:00Z'),
    });
  });

  it('a capa só passa se for https em host da PlayStation', async () => {
    const { provider } = montar();

    const { itens } = await provider.listarBiblioteca(ACCOUNT_ID_SINTETICO, CTX);

    expect(itens.map((i) => i.capaUrl)).toEqual([
      'https://image.api.playstation.com/exemplo/a.png',
      null,
      null,
      null,
    ]);
  });

  it('o perfil traz nome, avatar, nível e troféus da conta, sem link nem status', async () => {
    const { provider } = montar();

    const { perfil } = await provider.listarBiblioteca(ACCOUNT_ID_SINTETICO, CTX);

    expect(perfil).toEqual({
      nomeExibicao: 'conta_exemplo',
      avatarUrl: 'https://image.api.playstation.com/a.png',
      perfilUrl: null,
      publico: true,
      nivel: { valor: 312, progressoPercentual: 42, faixa: 4 },
      trofeus: { platina: 3, ouro: 20, prata: 50, bronze: 100 },
    });
  });

  it('o perfil falhar não derruba a biblioteca: cai no nome guardado', async () => {
    const { provider, client } = montar();
    client.perfil.mockRejectedValue(new Error('x'));

    const { perfil, itens } = await provider.listarBiblioteca(ACCOUNT_ID_SINTETICO, CTX);

    expect(itens).toHaveLength(4);
    expect(perfil).toMatchObject({ nomeExibicao: 'conta_exemplo', avatarUrl: null });
  });

  it('accountId inválido → IdExternoInvalidoError antes de qualquer chamada à Sony', async () => {
    const { provider, client, sessao } = montar();
    client.validarAccountId.mockImplementation(() => {
      throw new IdExternoInvalidoError('idConta', 'x');
    });

    await expect(provider.listarBiblioteca('abc', CTX)).rejects.toBeInstanceOf(
      IdExternoInvalidoError,
    );
    expect(sessao.comToken).not.toHaveBeenCalled();
    expect(client.jogados).not.toHaveBeenCalled();
  });
});

describe('PsnProvider.obterJogo (CA-19, CA-41)', () => {
  it('titleId fora do formato → IdExternoInvalidoError antes de qualquer chamada', async () => {
    const { provider, client } = montar();

    for (const ruim of ['504230', 'ppsa01234_00', 'PPSA01234', '../x', '']) {
      await expect(provider.obterJogo(ACCOUNT_ID_SINTETICO, ruim, CTX)).rejects.toBeInstanceOf(
        IdExternoInvalidoError,
      );
    }
    expect(client.jogados).not.toHaveBeenCalled();
  });

  it('item que não é da biblioteca → PlataformaItemNaoEncontradoError, sem consultar troféus', async () => {
    const { provider, client } = montar();

    await expect(
      provider.obterJogo(ACCOUNT_ID_SINTETICO, 'CUSA00000_00', CTX),
    ).rejects.toBeInstanceOf(PlataformaItemNaoEncontradoError);
    expect(client.conjuntoDeTrofeus).not.toHaveBeenCalled();
  });

  it('totais e desbloqueados são a soma dos tipos; as horas vêm da biblioteca', async () => {
    const { provider } = montar();

    const { dados, aviso } = await provider.obterJogo(ACCOUNT_ID_SINTETICO, TITLE_PS5, CTX);

    expect(dados).toMatchObject({
      idExterno: TITLE_PS5,
      minutosJogados: 600,
      conquistasTotal: 6,
      conquistasDesbloqueadas: 3,
    });
    expect(aviso).toBeNull();
  });

  it('sem conjunto de troféus (nunca sincronizou) → 0 de 0 e aviso SEM_CONQUISTAS', async () => {
    const { provider, client } = montar();
    client.conjuntoDeTrofeus.mockResolvedValue(null);

    const { dados, aviso } = await provider.obterJogo(ACCOUNT_ID_SINTETICO, TITLE_PS5, CTX);

    expect(dados).toMatchObject({ conquistasTotal: 0, conquistasDesbloqueadas: 0 });
    expect(aviso).toBe('SEM_CONQUISTAS');
  });

  it('liga uma segunda vez sem reler a biblioteca (cache de 10 min)', async () => {
    const { provider, client } = montar();

    await provider.obterJogo(ACCOUNT_ID_SINTETICO, TITLE_PS5, CTX);
    await provider.obterJogo(ACCOUNT_ID_SINTETICO, TITLE_PS4, CTX);

    expect(client.jogados).toHaveBeenCalledTimes(1);
  });
});

describe('PsnProvider.obterDetalhe (CA-42 a CA-46)', () => {
  const opcoes = { comHoras: false, ignorarCache: false };

  it('a lista traz nome, descrição, ícone, data, tipo e raridade; o porTipo bate com a lista (DLC incluída)', async () => {
    const { provider } = montar();

    const detalhe = await provider.obterDetalhe(ACCOUNT_ID_SINTETICO, TITLE_PS5, opcoes, CTX);

    expect(detalhe.conquistasTotal).toBe(5);
    expect(detalhe.conquistasDesbloqueadas).toBe(2);
    expect(detalhe.conquistas[1]).toMatchObject({
      id: '1',
      nome: 'Ouro Exemplo',
      tipo: 'ouro',
      desbloqueada: false,
      raridadePercentual: 4.8,
      raridadeNivel: 'raro',
      iconeUrl: 'https://psnobj.prod.dl.playstation.net/1.png',
    });
    expect(detalhe.conquistas[0]).toMatchObject({
      raridadePercentual: 0.9,
      raridadeNivel: 'ultrarraro',
    });
    expect(detalhe.conquistas[3]).toMatchObject({
      desbloqueada: true,
      desbloqueadaEm: '2026-02-03T10:00:00.000Z',
      raridadeNivel: 'comum',
    });
    expect(detalhe.porTipo).toEqual({
      platina: { total: 1, desbloqueados: 0 },
      ouro: { total: 1, desbloqueados: 0 },
      prata: { total: 1, desbloqueados: 1 },
      bronze: { total: 2, desbloqueados: 1 },
    });
    expect(detalhe.horas).toBeNull();
  });

  it('troféu OCULTO e bloqueado sai sem nome nem descrição nem ícone, qualquer que seja a resposta; desbloqueado mostra tudo (CA-43)', async () => {
    const { provider } = montar();

    const { conquistas } = await provider.obterDetalhe(
      ACCOUNT_ID_SINTETICO,
      TITLE_PS5,
      opcoes,
      CTX,
    );

    expect(conquistas[2]).toMatchObject({
      oculta: true,
      desbloqueada: false,
      nome: '',
      descricao: null,
      iconeUrl: null,
    });
    expect(JSON.stringify(conquistas[2])).not.toContain('NÃO PODE SAIR');
    expect(JSON.stringify(conquistas[2])).not.toContain('Segredo Exemplo');
    expect(conquistas[3]).toMatchObject({
      oculta: true,
      desbloqueada: true,
      nome: 'Segredo Ganho',
      descricao: 'Pode sair',
    });
  });

  it('a frio: mapa + definições + ganhos (3 chamadas); a quente: 0; outro usuário: só os ganhos (CA-45)', async () => {
    const { provider, client } = montar();

    await provider.obterDetalhe(ACCOUNT_ID_SINTETICO, TITLE_PS5, opcoes, CTX);
    expect(client.conjuntoDeTrofeus).toHaveBeenCalledTimes(1);
    expect(client.definicoesDeTrofeus).toHaveBeenCalledTimes(1);
    expect(client.ganhosDeTrofeus).toHaveBeenCalledTimes(1);

    await provider.obterDetalhe(ACCOUNT_ID_SINTETICO, TITLE_PS5, opcoes, CTX);
    expect(client.conjuntoDeTrofeus).toHaveBeenCalledTimes(1);
    expect(client.definicoesDeTrofeus).toHaveBeenCalledTimes(1);
    expect(client.ganhosDeTrofeus).toHaveBeenCalledTimes(1);

    await provider.obterDetalhe('9999999999', TITLE_PS5, opcoes, { ...CTX, contaId: 'conta-2' });
    expect(client.conjuntoDeTrofeus).toHaveBeenCalledTimes(1);
    expect(client.definicoesDeTrofeus).toHaveBeenCalledTimes(1);
    expect(client.ganhosDeTrofeus).toHaveBeenCalledTimes(2);
  });

  it('"Atualizar" (ignorarCache) refaz só os ganhos', async () => {
    const { provider, client } = montar();
    await provider.obterDetalhe(ACCOUNT_ID_SINTETICO, TITLE_PS5, opcoes, CTX);

    await provider.obterDetalhe(
      ACCOUNT_ID_SINTETICO,
      TITLE_PS5,
      { comHoras: false, ignorarCache: true },
      CTX,
    );

    expect(client.ganhosDeTrofeus).toHaveBeenCalledTimes(2);
    expect(client.definicoesDeTrofeus).toHaveBeenCalledTimes(1);
  });

  it('com horas, lê da biblioteca em cache (sem chamada extra depois da primeira)', async () => {
    const { provider, client } = montar();

    const a = await provider.obterDetalhe(
      ACCOUNT_ID_SINTETICO,
      TITLE_PS5,
      { comHoras: true, ignorarCache: false },
      CTX,
    );
    await provider.obterDetalhe(
      ACCOUNT_ID_SINTETICO,
      TITLE_PS5,
      { comHoras: true, ignorarCache: false },
      CTX,
    );

    expect(a.horas).toMatchObject({
      minutosJogados: 600,
      capaUrl: 'https://image.api.playstation.com/exemplo/a.png',
    });
    expect(client.jogados).toHaveBeenCalledTimes(1);
  });

  it('jogo sem conjunto de troféus → SEM_CONQUISTAS, e o "nada" não fica em cache por 24 h', async () => {
    const { provider, client } = montar();
    client.conjuntoDeTrofeus.mockResolvedValueOnce(null).mockResolvedValue(conjunto);

    const vazio = await provider.obterDetalhe(ACCOUNT_ID_SINTETICO, TITLE_PS5, opcoes, CTX);
    const depois = await provider.obterDetalhe(ACCOUNT_ID_SINTETICO, TITLE_PS5, opcoes, CTX);

    expect(vazio).toMatchObject({ aviso: 'SEM_CONQUISTAS', conquistas: [], porTipo: null });
    expect(depois.conquistas).toHaveLength(5);
  });
});
