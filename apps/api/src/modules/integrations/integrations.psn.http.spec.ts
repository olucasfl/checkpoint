import { type INestApplication } from '@nestjs/common';
import { CifraDeCredencial } from './psn/cifra-de-credencial';
import {
  PlataformaIndisponivelError,
  PlataformaReautenticarError,
  CredencialInvalidaError,
} from './providers/plataforma-errors';
import {
  ACCESS_SINTETICO,
  ACCOUNT_ID_SINTETICO,
  NPSSO_SINTETICO,
  REFRESH_NOVO_SINTETICO,
  REFRESH_SINTETICO,
  TITLE_PS5,
} from './psn/__fixtures__/respostas';
import {
  ANA_ID,
  BIA_ID,
  ENV,
  startIntegrationsApp,
  type IntegrationsHttpApp,
} from './testing/integrations-http-app';

// Valores sintéticos e óbvios (RULES.md §8). A PlayStation é falada por um `PsnClient` de mentira: nenhuma chamada à Sony.
const CIFRA = new CifraDeCredencial({ get: (k: string) => ENV[k as keyof typeof ENV] } as never);
const SEGREDOS = [
  NPSSO_SINTETICO,
  REFRESH_SINTETICO,
  REFRESH_NOVO_SINTETICO,
  ACCESS_SINTETICO,
  ENV.PSN_TOKEN_ENCRYPTION_KEY,
];
const JOGO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let ctx: IntegrationsHttpApp;
let app: INestApplication;

function tokensDaSony(refresh = REFRESH_SINTETICO) {
  return {
    accessToken: ACCESS_SINTETICO,
    accessExpiraEm: new Date(Date.now() + 3_600_000),
    refreshToken: refresh,
    refreshExpiraEm: new Date(Date.now() + 5e9),
  };
}

const resumo = {
  accountId: ACCOUNT_ID_SINTETICO,
  nivel: 312,
  progressoPercentual: 42,
  faixa: 4,
  trofeus: { platina: 3, ouro: 20, prata: 50, bronze: 100 },
};

const jogo = {
  titleId: TITLE_PS5,
  nome: 'Jogo Exemplo',
  categoria: 'ps5_native_game',
  minutosJogados: 600,
  ultimaVezJogadoEm: new Date('2026-03-01T22:30:00Z'),
  imagemUrl: 'https://image.api.playstation.com/exemplo/a.png',
};

async function pedir(
  metodo: string,
  caminho: string,
  token?: string,
  corpo?: unknown,
): Promise<{ status: number; corpo: Record<string, unknown> | undefined; headers: Headers }> {
  const response = await fetch(`${ctx.baseUrl}${caminho}`, {
    method: metodo,
    redirect: 'manual',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const texto = await response.text();
  return {
    status: response.status,
    corpo: texto ? (JSON.parse(texto) as Record<string, unknown>) : undefined,
    headers: response.headers,
  };
}

/** Uma conta PSN já vinculada, com a credencial cifrada de verdade no "banco". */
function vincularNoBanco(
  userId: string,
  opcoes: { reautenticar?: boolean; expiraEm?: Date } = {},
): string {
  const contaId = crypto.randomUUID();
  ctx.db.contas.push({
    id: contaId,
    userId,
    provedor: 'PLAYSTATION',
    idExterno: ACCOUNT_ID_SINTETICO,
    nomeExibicao: 'conta_exemplo',
    vinculadaEm: new Date(),
    reautenticarDesde: opcoes.reautenticar ? new Date() : null,
  });
  ctx.db.credenciais.push({
    id: crypto.randomUUID(),
    contaId,
    refreshCifrado: CIFRA.cifrar(REFRESH_SINTETICO, contaId),
    expiraEm: opcoes.expiraEm ?? new Date(Date.now() + 30 * 24 * 3_600_000),
  });
  return contaId;
}

beforeEach(async () => {
  ctx = await startIntegrationsApp();
  app = ctx.app;
  ctx.psn.trocarNpsso.mockResolvedValue(tokensDaSony());
  ctx.psn.renovar.mockResolvedValue(tokensDaSony());
  ctx.psn.resumoDeTrofeus.mockResolvedValue(resumo);
  ctx.psn.perfil.mockResolvedValue({ onlineId: 'conta_exemplo', avatarUrl: null });
  ctx.psn.jogados.mockResolvedValue([jogo]);
  ctx.psn.conjuntoDeTrofeus.mockResolvedValue(null);
});

afterEach(async () => {
  await app.close();
});

function semSegredo(texto: string): void {
  for (const segredo of SEGREDOS) {
    expect(texto).not.toContain(segredo);
  }
  expect(texto).not.toContain(ACCOUNT_ID_SINTETICO.slice(0, 12) + 'x');
}

describe('POST /integracoes/playstation/vinculo/credencial (CA-10 a CA-14)', () => {
  it('cria a conta e a credencial CIFRADA; a resposta não traz NPSSO, token nem userId (CA-10)', async () => {
    const token = await ctx.tokenFor(ANA_ID);

    const r = await pedir('POST', '/integracoes/playstation/vinculo/credencial', token, {
      credencial: NPSSO_SINTETICO,
    });

    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({
      provedor: 'PLAYSTATION',
      idExterno: ACCOUNT_ID_SINTETICO,
      nomeExibicao: 'conta_exemplo',
      estado: 'ativa',
    });
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys(r.corpo ?? {}).sort()).toEqual([
      'estado',
      'idExterno',
      'nomeExibicao',
      'provedor',
      'vinculadaEm',
    ]);
    expect(JSON.stringify(r.corpo)).not.toContain(ANA_ID);
    semSegredo(JSON.stringify(r.corpo));

    expect(ctx.db.contas).toHaveLength(1);
    expect(ctx.db.credenciais).toHaveLength(1);
    const guardado = ctx.db.credenciais[0];
    expect(guardado?.contaId).toBe(ctx.db.contas[0]?.id);
    semSegredo(JSON.stringify(ctx.db.contas) + JSON.stringify(ctx.db.credenciais));
    // Decifra com a conta certa: prova que o que ficou é o refresh, cifrado com a conta como AAD.
    expect(CIFRA.decifrar(guardado?.refreshCifrado ?? '', ctx.db.contas[0]?.id ?? '')).toBe(
      REFRESH_SINTETICO,
    );
  });

  it('o NPSSO só existe no corpo: o provider o recebe e mais ninguém', async () => {
    const token = await ctx.tokenFor(ANA_ID);

    await pedir('POST', '/integracoes/playstation/vinculo/credencial', token, {
      credencial: NPSSO_SINTETICO,
    });

    expect(ctx.psn.trocarNpsso).toHaveBeenCalledWith(NPSSO_SINTETICO);
    expect(ctx.psn.trocarNpsso).toHaveBeenCalledTimes(1);
  });

  it('mesma conta em `reautenticar` + NPSSO novo → 200, credencial regravada e o estado volta a ativa (CA-11)', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    const contaId = vincularNoBanco(ANA_ID, { reautenticar: true });
    ctx.psn.trocarNpsso.mockResolvedValue(tokensDaSony(REFRESH_NOVO_SINTETICO));

    const r = await pedir('POST', '/integracoes/playstation/vinculo/credencial', token, {
      credencial: NPSSO_SINTETICO,
    });

    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ estado: 'ativa' });
    expect(ctx.db.contas).toHaveLength(1);
    expect(ctx.db.contas[0]?.reautenticarDesde).toBeNull();
    expect(CIFRA.decifrar(ctx.db.credenciais[0]?.refreshCifrado ?? '', contaId)).toBe(
      REFRESH_NOVO_SINTETICO,
    );
  });

  it('OUTRO accountId → 409 PLATAFORMA_JA_VINCULADA e nada muda (CA-11)', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    vincularNoBanco(ANA_ID);
    const antes = JSON.stringify(ctx.db.credenciais);
    ctx.psn.resumoDeTrofeus.mockResolvedValue({ ...resumo, accountId: '999' });

    const r = await pedir('POST', '/integracoes/playstation/vinculo/credencial', token, {
      credencial: NPSSO_SINTETICO,
    });

    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({ code: 'PLATAFORMA_JA_VINCULADA' });
    expect(JSON.stringify(ctx.db.credenciais)).toBe(antes);
    expect(ctx.db.contas).toHaveLength(1);
  });

  it('dois usuários podem vincular a MESMA conta PSN, cada um com a própria credencial', async () => {
    await pedir('POST', '/integracoes/playstation/vinculo/credencial', await ctx.tokenFor(ANA_ID), {
      credencial: NPSSO_SINTETICO,
    });
    const r = await pedir(
      'POST',
      '/integracoes/playstation/vinculo/credencial',
      await ctx.tokenFor(BIA_ID),
      { credencial: NPSSO_SINTETICO },
    );

    expect(r.status).toBe(200);
    expect(ctx.db.contas).toHaveLength(2);
    expect(ctx.db.credenciais).toHaveLength(2);
  });

  it.each([
    ['sem credencial', {}],
    ['credencial numérica', { credencial: 1234567890 }],
    ['array', { credencial: ['x'] }],
    ['vazia', { credencial: '' }],
    ['com 200 caracteres', { credencial: 'a'.repeat(200) }],
    ['campo desconhecido', { credencial: NPSSO_SINTETICO, extra: true }],
  ])('corpo inválido (%s) → 400 VALIDACAO e o valor não é ecoado (CA-12)', async (_nome, corpo) => {
    const token = await ctx.tokenFor(ANA_ID);

    const r = await pedir('POST', '/integracoes/playstation/vinculo/credencial', token, corpo);

    expect(r.status).toBe(400);
    expect(r.corpo).toMatchObject({ code: 'VALIDACAO' });
    expect(JSON.stringify(r.corpo)).not.toContain('a'.repeat(50));
    expect(ctx.psn.trocarNpsso).not.toHaveBeenCalled();
  });

  it('a Sony recusa o NPSSO → 400 PLATAFORMA_CREDENCIAL_INVALIDA com fields.credencial, nada é gravado (CA-13) [~]', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    ctx.psn.trocarNpsso.mockRejectedValue(new CredencialInvalidaError());

    const r = await pedir('POST', '/integracoes/playstation/vinculo/credencial', token, {
      credencial: NPSSO_SINTETICO,
    });

    expect(r.status).toBe(400);
    expect(r.corpo).toMatchObject({ code: 'PLATAFORMA_CREDENCIAL_INVALIDA' });
    expect(r.corpo?.fields).toHaveProperty('credencial');
    expect(ctx.db.contas).toHaveLength(0);
    expect(ctx.db.credenciais).toHaveLength(0);
  });

  it('a Sony fora do ar → 502, nada é gravado', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    ctx.psn.trocarNpsso.mockRejectedValue(new PlataformaIndisponivelError());

    const r = await pedir('POST', '/integracoes/playstation/vinculo/credencial', token, {
      credencial: NPSSO_SINTETICO,
    });

    expect(r.status).toBe(502);
    expect(ctx.db.contas).toHaveLength(0);
  });

  it('Steam por credencial, e PlayStation por redirecionamento → 400 VALIDACAO; sem token → 401 (CA-14)', async () => {
    const token = await ctx.tokenFor(ANA_ID);

    const steam = await pedir('POST', '/integracoes/steam/vinculo/credencial', token, {
      credencial: NPSSO_SINTETICO,
    });
    const iniciar = await pedir('POST', '/integracoes/playstation/vinculo', token);
    const retorno = await pedir('GET', '/integracoes/playstation/retorno?state=x');
    const semToken = await pedir('POST', '/integracoes/playstation/vinculo/credencial', undefined, {
      credencial: NPSSO_SINTETICO,
    });

    expect([steam.status, iniciar.status, retorno.status]).toEqual([400, 400, 400]);
    expect(steam.corpo).toMatchObject({ code: 'VALIDACAO' });
    expect(iniciar.corpo).toMatchObject({ code: 'VALIDACAO' });
    expect(retorno.corpo).toMatchObject({ code: 'VALIDACAO' });
    expect(semToken.status).toBe(401);
    expect(ctx.psn.trocarNpsso).not.toHaveBeenCalled();
  });

  it('limite de 5 por minuto por usuário, o mesmo do vínculo', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    ctx.psn.trocarNpsso.mockRejectedValue(new CredencialInvalidaError());

    const status: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      status.push(
        (
          await pedir('POST', '/integracoes/playstation/vinculo/credencial', token, {
            credencial: NPSSO_SINTETICO,
          })
        ).status,
      );
    }

    expect(status).toEqual([400, 400, 400, 400, 400, 429]);
  });
});

describe('estado reautenticar (CA-15, CA-16)', () => {
  it.each([
    ['GET', '/integracoes/playstation/biblioteca'],
    ['GET', '/integracoes/playstation/resumo'],
    ['GET', '/integracoes/playstation/perfil'],
    ['POST', '/integracoes/playstation/resumo/atualizacao'],
    ['POST', '/integracoes/playstation/perfil/atualizacao'],
  ])(
    '%s %s em `reautenticar` → 409 PLATAFORMA_REAUTENTICAR sem chamar a Sony',
    async (metodo, caminho) => {
      const token = await ctx.tokenFor(ANA_ID);
      vincularNoBanco(ANA_ID, { reautenticar: true });

      const r = await pedir(metodo, caminho, token);

      expect(r.status).toBe(409);
      expect(r.corpo).toMatchObject({ code: 'PLATAFORMA_REAUTENTICAR' });
      expect(ctx.psn.renovar).not.toHaveBeenCalled();
      expect(ctx.psn.jogados).not.toHaveBeenCalled();
    },
  );

  it('o detalhe de um jogo ligado devolve o gravado com aviso REAUTENTICAR (nunca 409); o "Atualizar" é 409', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    vincularNoBanco(ANA_ID, { reautenticar: true });
    ctx.db.games.push({ id: JOGO_ID, userId: ANA_ID, titulo: 'Jogo Exemplo', plataforma: 'PS5' });
    ctx.db.jogos.push({
      id: 'v1',
      userId: ANA_ID,
      gameId: JOGO_ID,
      provedor: 'PLAYSTATION',
      idExterno: TITLE_PS5,
      minutosJogados: 600,
      conquistasTotal: 40,
      conquistasDesbloqueadas: 12,
      atualizadoEm: new Date(),
    });

    const detalhe = await pedir('GET', `/integracoes/playstation/jogos/${JOGO_ID}`, token);
    const atualizar = await pedir(
      'POST',
      `/integracoes/playstation/jogos/${JOGO_ID}/atualizacao`,
      token,
    );

    expect(detalhe.status).toBe(200);
    expect(detalhe.corpo).toMatchObject({ aviso: 'REAUTENTICAR', conquistas: [] });
    expect(detalhe.corpo?.dados).toMatchObject({ minutosJogados: 600, conquistasTotal: 40 });
    expect(atualizar.status).toBe(409);
    expect(ctx.psn.renovar).not.toHaveBeenCalled();
  });

  it('refresh VENCIDO (expiraEm no passado) → 409 e a conta passa a `reautenticar`, sem chamar a Sony (CA-16)', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    vincularNoBanco(ANA_ID, { expiraEm: new Date(Date.now() - 1000) });

    const r = await pedir('GET', '/integracoes/playstation/biblioteca', token);

    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({ code: 'PLATAFORMA_REAUTENTICAR' });
    expect(ctx.db.contas[0]?.reautenticarDesde).toBeInstanceOf(Date);
    expect(ctx.psn.renovar).not.toHaveBeenCalled();
    const lista = await pedir('GET', '/integracoes', token);
    expect((lista.corpo as unknown as Record<string, unknown>[])[0]).toMatchObject({
      estado: 'reautenticar',
    });
  });

  it('refresh RECUSADO pela Sony → 409 e `reautenticar`; timeout/5xx → 502 e a conta continua ativa (CA-16) [~]', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    vincularNoBanco(ANA_ID);
    ctx.psn.renovar.mockRejectedValueOnce(new PlataformaIndisponivelError());

    const fora = await pedir('GET', '/integracoes/playstation/biblioteca', token);
    expect(fora.status).toBe(502);
    expect(ctx.db.contas[0]?.reautenticarDesde ?? null).toBeNull();

    ctx.psn.renovar.mockRejectedValueOnce(new PlataformaReautenticarError());
    const recusado = await pedir('GET', '/integracoes/playstation/biblioteca', token);
    expect(recusado.status).toBe(409);
    expect(ctx.db.contas[0]?.reautenticarDesde).toBeInstanceOf(Date);
  });
});

describe('leituras e ligação com a PlayStation (CA-17, CA-37, CA-38, CA-46)', () => {
  it('biblioteca: um item por titleId, plataforma sugerida, e o resumo com nível e troféus', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    vincularNoBanco(ANA_ID);

    const biblioteca = await pedir('GET', '/integracoes/playstation/biblioteca', token);
    const r = await pedir('GET', '/integracoes/playstation/resumo', token);

    expect(biblioteca.status).toBe(200);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({
      provedor: 'PLAYSTATION',
      nomeExibicao: 'conta_exemplo',
      nivel: { valor: 312, progressoPercentual: 42, faixa: 4 },
      trofeus: { platina: 3, ouro: 20, prata: 50, bronze: 100 },
      membroDesde: null,
      status: null,
      jogandoAgora: null,
      perfilUrl: null,
    });
    // A quente: o resumo dividiu a resposta da biblioteca (mesmo cache `provedor:idExterno`).
    expect(ctx.psn.jogados).toHaveBeenCalledTimes(1);
    expect(ctx.psn.resumoDeTrofeus).toHaveBeenCalledTimes(1);
    expect(ctx.psn.renovar).toHaveBeenCalledTimes(1);
    semSegredo(JSON.stringify(r.corpo));
  });

  it('a lista da biblioteca traz o item com a plataforma sugerida', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    vincularNoBanco(ANA_ID);

    const response = await fetch(`${ctx.baseUrl}/integracoes/playstation/biblioteca`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const itens = (await response.json()) as Record<string, unknown>[];

    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({
      idExterno: TITLE_PS5,
      titulo: 'Jogo Exemplo',
      plataformaSugerida: 'PS5',
      minutosJogados: 600,
    });
  });

  it('PUT liga o item, 1 para 1; o 409 do item já ligado não chama a Sony; titleId fora da biblioteca → 404; malformado → 400', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    vincularNoBanco(ANA_ID);
    const OUTRO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    ctx.db.games.push({ id: JOGO_ID, userId: ANA_ID, titulo: 'Jogo Exemplo', plataforma: 'PS5' });
    ctx.db.games.push({ id: OUTRO, userId: ANA_ID, titulo: 'Outro', plataforma: 'PS5' });

    const ligou = await pedir('PUT', `/integracoes/playstation/jogos/${JOGO_ID}`, token, {
      idExterno: TITLE_PS5,
    });
    const chamadasAntes = ctx.psn.conjuntoDeTrofeus.mock.calls.length;
    const repetido = await pedir('PUT', `/integracoes/playstation/jogos/${OUTRO}`, token, {
      idExterno: TITLE_PS5,
    });
    const fora = await pedir('PUT', `/integracoes/playstation/jogos/${OUTRO}`, token, {
      idExterno: 'PPSA99999_00',
    });
    const ruim = await pedir('PUT', `/integracoes/playstation/jogos/${OUTRO}`, token, {
      idExterno: '504230',
    });

    expect(ligou.status).toBe(200);
    expect(ligou.corpo).toMatchObject({
      provedor: 'PLAYSTATION',
      idExterno: TITLE_PS5,
      minutosJogados: 600,
      conquistasTotal: 0,
    });
    expect(repetido.status).toBe(409);
    expect(repetido.corpo).toMatchObject({ code: 'PLATAFORMA_ITEM_JA_VINCULADO' });
    expect(ctx.psn.conjuntoDeTrofeus.mock.calls.length).toBe(chamadasAntes);
    expect(fora.status).toBe(404);
    expect(fora.corpo).toMatchObject({ code: 'PLATAFORMA_ITEM_NAO_ENCONTRADO' });
    expect(ruim.status).toBe(400);
    expect(ruim.corpo).toMatchObject({ code: 'VALIDACAO' });
  });

  it('a Sony fora do ar ao ligar → 502 e nada é gravado', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    vincularNoBanco(ANA_ID);
    ctx.db.games.push({ id: JOGO_ID, userId: ANA_ID, titulo: 'Jogo Exemplo', plataforma: 'PS5' });
    ctx.psn.jogados.mockRejectedValue(new PlataformaIndisponivelError());

    const r = await pedir('PUT', `/integracoes/playstation/jogos/${JOGO_ID}`, token, {
      idExterno: TITLE_PS5,
    });

    expect(r.status).toBe(502);
    expect(ctx.db.jogos).toHaveLength(0);
  });
});

describe('isolamento da PlayStation (CA-20) e segredos (CA-21)', () => {
  it('a Sony falhando (502) não afeta a Steam nem a lista de contas', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    vincularNoBanco(ANA_ID);
    ctx.db.contas.push({
      id: 'steam-1',
      userId: ANA_ID,
      provedor: 'STEAM',
      idExterno: '76561190000000000',
      nomeExibicao: 'Jogador',
      vinculadaEm: new Date(),
    });
    ctx.client.obterPerfil.mockResolvedValue({
      visibilidade: 3,
      nome: 'Jogador',
      avatarUrl: null,
      perfilUrl: null,
    });
    ctx.client.listarJogos.mockResolvedValue({ privada: false, total: 0, jogos: [] });
    ctx.psn.renovar.mockRejectedValue(new PlataformaIndisponivelError());

    const psn = await pedir('GET', '/integracoes/playstation/biblioteca', token);
    const steam = await pedir('GET', '/integracoes/steam/perfil', token);
    const lista = await pedir('GET', '/integracoes', token);

    expect(psn.status).toBe(502);
    expect(steam.status).toBe(200);
    expect(lista.status).toBe(200);
  });

  it('uma execução completa (vincular, ler, ligar, falhar) não deixa NPSSO, token, chave nem accountId em log nem em resposta (CA-21)', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    const respostas: string[] = [];
    const registrar = (r: { corpo: unknown }) => respostas.push(JSON.stringify(r.corpo ?? ''));
    ctx.db.games.push({ id: JOGO_ID, userId: ANA_ID, titulo: 'Jogo Exemplo', plataforma: 'PS5' });

    registrar(
      await pedir('POST', '/integracoes/playstation/vinculo/credencial', token, {
        credencial: NPSSO_SINTETICO,
      }),
    );
    registrar(
      await pedir('POST', '/integracoes/playstation/vinculo/credencial', token, {
        credencial: 'não é um npsso',
      }),
    );
    registrar(await pedir('GET', '/integracoes/playstation/resumo', token));
    registrar(
      await pedir('PUT', `/integracoes/playstation/jogos/${JOGO_ID}`, token, {
        idExterno: TITLE_PS5,
      }),
    );
    ctx.psn.renovar.mockRejectedValue(new PlataformaReautenticarError());
    registrar(await pedir('POST', '/integracoes/playstation/resumo/atualizacao', token));
    registrar(await pedir('GET', '/integracoes/playstation/biblioteca', token));
    ctx.psn.trocarNpsso.mockRejectedValue(new CredencialInvalidaError());
    registrar(
      await pedir('POST', '/integracoes/playstation/vinculo/credencial', token, {
        credencial: NPSSO_SINTETICO,
      }),
    );

    semSegredo(respostas.join('\n'));
    semSegredo(ctx.logger.lines.join('\n'));
    expect(ctx.logger.lines.join('\n')).not.toContain(ACCOUNT_ID_SINTETICO);
    expect(ctx.logger.lines.join('\n')).not.toContain(ANA_ID);
  });
});

describe('desvincular e chave ausente (CA-04, CA-22)', () => {
  it('DELETE: apaga a conta, a credencial cifrada e as ligações; os jogos ficam (CA-22)', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    vincularNoBanco(ANA_ID);
    ctx.db.games.push({ id: JOGO_ID, userId: ANA_ID, titulo: 'Jogo Exemplo', plataforma: 'PS5' });
    ctx.db.jogos.push({
      id: 'v1',
      userId: ANA_ID,
      gameId: JOGO_ID,
      provedor: 'PLAYSTATION',
      idExterno: TITLE_PS5,
      conquistasTotal: 1,
      conquistasDesbloqueadas: 0,
    });

    const r = await pedir('DELETE', '/integracoes/playstation', token);

    expect(r.status).toBe(204);
    expect(ctx.db.contas).toHaveLength(0);
    expect(ctx.db.credenciais).toHaveLength(0);
    expect(ctx.db.jogos).toHaveLength(0);
    expect(ctx.db.games).toHaveLength(1);
  });

  it('sem PSN_TOKEN_ENCRYPTION_KEY a API sobe, a Steam funciona e a PlayStation some (400 VALIDACAO) (CA-04)', async () => {
    await app.close();
    const { PSN_TOKEN_ENCRYPTION_KEY: _chave, ...semChave } = ENV;
    ctx = await startIntegrationsApp(semChave);
    app = ctx.app;
    const token = await ctx.tokenFor(ANA_ID);

    const lista = await pedir('GET', '/integracoes', token);
    const psn = await pedir('POST', '/integracoes/playstation/vinculo/credencial', token, {
      credencial: NPSSO_SINTETICO,
    });

    expect(lista.status).toBe(200);
    expect(psn.status).toBe(400);
    expect(psn.corpo).toMatchObject({ code: 'VALIDACAO' });
    expect(ctx.psn.trocarNpsso).not.toHaveBeenCalled();
  });
});
