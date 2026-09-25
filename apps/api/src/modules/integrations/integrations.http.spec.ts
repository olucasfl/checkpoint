import { type INestApplication } from '@nestjs/common';
import {
  PerfilPrivadoError,
  PlataformaIndisponivelError,
  PlataformaLimiteError,
  VinculoCanceladoError,
  VinculoRecusadoError,
} from './providers/plataforma-errors';
import { VinculoStateService } from './vinculo/vinculo-state.service';
import {
  ANA_ID,
  BIA_ID,
  type IntegrationsHttpApp,
  startIntegrationsApp,
} from './testing/integrations-http-app';

// Valores sintéticos e óbvios (RULES.md §8): nenhum SteamID, nome ou avatar reais.
const STEAM_ID = '76561190000000000';
const WEB = 'http://localhost:5173';

const perfilPublico = {
  visibilidade: 3,
  nome: 'Jogador Sintetico',
  avatarUrl: 'https://avatars.steamstatic.com/0000_full.jpg',
  perfilUrl: 'https://steamcommunity.com/profiles/x/',
};

const bibliotecaPublica = {
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
};

let ctx: IntegrationsHttpApp;
let app: INestApplication;

/** O que o navegador guarda e devolve: o `state` (na URL da Steam) e o nonce (no cookie). */
interface Ida {
  status: number;
  url?: string;
  state?: string;
  nonce?: string;
  setCookies: string[];
  cacheControl: string | null;
  json: Record<string, unknown> | undefined;
}

async function pedir(
  metodo: string,
  caminho: string,
  token?: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${ctx.baseUrl}${caminho}`, {
    method: metodo,
    redirect: 'manual',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders },
  });
}

async function json(response: Response): Promise<Record<string, unknown> | undefined> {
  const texto = await response.text();
  return texto ? (JSON.parse(texto) as Record<string, unknown>) : undefined;
}

async function iniciar(token: string): Promise<Ida> {
  const response = await pedir('POST', '/integracoes/steam/vinculo', token);
  const corpo = await json(response);
  const setCookies = response.headers.getSetCookie();
  const url = typeof corpo?.url === 'string' ? corpo.url : undefined;
  const returnTo = url ? new URL(url).searchParams.get('openid.return_to') : null;
  const cookie = setCookies.find((c) => c.startsWith('checkpoint_vinculo='));
  return {
    status: response.status,
    url,
    state: returnTo ? (new URL(returnTo).searchParams.get('state') ?? undefined) : undefined,
    nonce: cookie?.split(';')[0]?.slice('checkpoint_vinculo='.length),
    setCookies,
    cacheControl: response.headers.get('cache-control'),
    json: corpo,
  };
}

/** O retorno da Steam: um GET do navegador, SEM Authorization, com o cookie do vínculo. */
async function retornar(
  state: string | undefined,
  nonce: string | undefined,
  extra = '',
): Promise<Response> {
  const query = `${state === undefined ? '' : `state=${encodeURIComponent(state)}&`}openid.mode=id_res${extra}`;
  return pedir('GET', `/integracoes/steam/retorno?${query}`, undefined, {
    ...(nonce === undefined ? {} : { cookie: `checkpoint_vinculo=${nonce}` }),
  });
}

beforeEach(async () => {
  ctx = await startIntegrationsApp();
  app = ctx.app;
  ctx.openId.validarRetorno.mockResolvedValue(STEAM_ID);
  ctx.client.obterPerfil.mockResolvedValue(perfilPublico);
  ctx.client.listarJogos.mockResolvedValue(bibliotecaPublica);
});

afterEach(async () => {
  await app.close();
});

describe('autenticação das rotas (CA-57)', () => {
  it.each([
    ['GET', '/integracoes'],
    ['POST', '/integracoes/steam/vinculo'],
    ['DELETE', '/integracoes/steam'],
    ['GET', '/integracoes/steam/perfil'],
    ['POST', '/integracoes/steam/perfil/atualizacao'],
  ])('%s %s sem token → 401', async (metodo, caminho) => {
    const response = await pedir(metodo, caminho);

    expect(response.status).toBe(401);
    expect(await json(response)).toMatchObject({ code: 'AUTH_NAO_AUTENTICADO' });
  });

  it('o retorno do OpenID é público: sem Authorization vira 302, nunca 401', async () => {
    const response = await retornar(undefined, undefined);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${WEB}/perfil?steam=erro&motivo=invalido`);
  });
});

describe('POST /integracoes/steam/vinculo (CA-06, CA-07)', () => {
  it('200 com { url } para a Steam e o cookie do vínculo com os atributos certos (CA-06)', async () => {
    const ida = await iniciar(await ctx.tokenFor(ANA_ID));

    expect(ida.status).toBe(200);
    expect(Object.keys(ida.json ?? {})).toEqual(['url']);
    const url = new URL(ida.url ?? '');
    expect(`${url.origin}${url.pathname}`).toBe('https://steamcommunity.com/openid/login');
    expect(url.searchParams.get('openid.mode')).toBe('checkid_setup');
    expect(url.searchParams.get('openid.realm')).toBe('http://localhost:3333');
    expect(url.searchParams.get('openid.return_to')).toBe(
      `http://localhost:3333/api/integracoes/steam/retorno?state=${ida.state}`,
    );
    expect(ida.cacheControl).toBe('no-store');

    const cookie = ida.setCookies.find((c) => c.startsWith('checkpoint_vinculo='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/integracoes(;|$)/);
    expect(cookie).toMatch(/Max-Age=600/i);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).not.toMatch(/Secure/i); // dev: sem HTTPS
  });

  it('em produção o cookie é Secure', async () => {
    await app.close();
    ctx = await startIntegrationsApp({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'segredo-de-acesso-sintetico-com-mais-de-32-caracteres',
      JWT_REFRESH_SECRET: 'segredo-de-refresh-sintetico-com-mais-de-32-caracteres',
      API_PUBLIC_URL: 'https://checkpoint.exemplo.vercel.app',
      WEB_PUBLIC_URL: 'https://checkpoint.exemplo.vercel.app',
      STEAM_API_KEY: 'ABCDEF0123456789ABCDEF0123456789',
    });
    app = ctx.app;

    const ida = await iniciar(await ctx.tokenFor(ANA_ID));

    expect(ida.setCookies.find((c) => c.startsWith('checkpoint_vinculo='))).toMatch(/Secure/i);
    // O return_to e o realm são o domínio da Vercel (o /api passa pelo rewrite), nunca o do Render.
    const url = new URL(ida.url ?? '');
    expect(url.searchParams.get('openid.realm')).toBe('https://checkpoint.exemplo.vercel.app');
    expect(url.searchParams.get('openid.return_to')).toMatch(
      /^https:\/\/checkpoint\.exemplo\.vercel\.app\/api\/integracoes\/steam\/retorno\?state=/,
    );
  });

  it('provedor desconhecido (xbox) → 400 VALIDACAO', async () => {
    const response = await pedir('POST', '/integracoes/xbox/vinculo', await ctx.tokenFor(ANA_ID));

    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ code: 'VALIDACAO' });
  });

  it('já vinculada → 409 PLATAFORMA_JA_VINCULADA', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    const ida = await iniciar(token);
    await retornar(ida.state, ida.nonce);

    const response = await pedir('POST', '/integracoes/steam/vinculo', token);

    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({ code: 'PLATAFORMA_JA_VINCULADA' });
  });

  it('o 6º pedido em 1 minuto → 429 LIMITE_TENTATIVAS com Retry-After; outro usuário no MESMO IP não é afetado', async () => {
    const ana = await ctx.tokenFor(ANA_ID);
    const bia = await ctx.tokenFor(BIA_ID);
    // Um cabeçalho X-Forwarded-For diferente por pedido não escapa do limite: a chave é o usuário, não o IP.
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await pedir('POST', '/integracoes/steam/vinculo', ana, {
        'x-forwarded-for': `203.0.113.${i + 1}`,
      });
      statuses.push(response.status);
      if (response.status === 429) {
        expect(await json(response)).toMatchObject({ statusCode: 429, code: 'LIMITE_TENTATIVAS' });
        expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
      }
    }
    // (O 2º pedido em diante devolve 409 porque a Ana ainda não vinculou? Não: nunca chegou ao retorno.)
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);

    const daBia = await pedir('POST', '/integracoes/steam/vinculo', bia);
    expect(daBia.status).toBe(200);
  });

  it('o limite de leitura (30 por minuto) também é por usuário', async () => {
    const ana = await ctx.tokenFor(ANA_ID);
    const bia = await ctx.tokenFor(BIA_ID);
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      statuses.push((await pedir('GET', '/integracoes', ana)).status);
    }

    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    expect((await pedir('GET', '/integracoes', bia)).status).toBe(200);
  });
});

describe('GET /integracoes/steam/retorno (CA-08 a CA-14)', () => {
  it('o caminho feliz: 302 para /perfil?steam=vinculada, conta gravada e cookie limpo (CA-08)', async () => {
    const ida = await iniciar(await ctx.tokenFor(ANA_ID));

    const response = await retornar(ida.state, ida.nonce, `&openid.claimed_id=x`);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${WEB}/perfil?steam=vinculada`);
    expect(ctx.db.contas).toEqual([
      expect.objectContaining({
        userId: ANA_ID,
        provedor: 'STEAM',
        idExterno: STEAM_ID,
        nomeExibicao: 'Jogador Sintetico',
      }),
    ]);
    const limpo = response.headers.getSetCookie().find((c) => c.startsWith('checkpoint_vinculo='));
    expect(limpo).toMatch(/checkpoint_vinculo=;/);
    expect(limpo).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect(limpo).toMatch(/Path=\/api\/integracoes/);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('a Steam é consultada com os openid.* da query (repassados ao SteamOpenId), não com o Bearer', async () => {
    const ida = await iniciar(await ctx.tokenFor(ANA_ID));

    await retornar(ida.state, ida.nonce, '&openid.sig=SIG');

    expect(ctx.openId.validarRetorno).toHaveBeenCalledTimes(1);
    const [query, returnTo] = ctx.openId.validarRetorno.mock.calls[0] as [
      Record<string, string>,
      string,
    ];
    expect(query['openid.sig']).toBe('SIG');
    expect(returnTo).toBe(`http://localhost:3333/api/integracoes/steam/retorno?state=${ida.state}`);
  });

  it.each([
    ['sem o cookie', (ida: Ida) => [ida.state, undefined] as const],
    ['com o nonce de outro navegador', (ida: Ida) => [ida.state, `${ida.nonce}x`] as const],
    ['sem o state', (ida: Ida) => [undefined, ida.nonce] as const],
  ])('%s → 302 invalido, nada gravado e a Steam NÃO é chamada (CA-09)', async (_nome, montar) => {
    const ida = await iniciar(await ctx.tokenFor(ANA_ID));
    const [state, nonce] = montar(ida);

    const response = await retornar(state, nonce);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${WEB}/perfil?steam=erro&motivo=invalido`);
    expect(ctx.db.contas).toHaveLength(0);
    expect(ctx.openId.validarRetorno).not.toHaveBeenCalled();
  });

  it('state adulterado → invalido; vencido → expirado (CA-10)', async () => {
    const ida = await iniciar(await ctx.tokenFor(ANA_ID));
    const state = ida.state ?? '';
    const adulterado = `${state.slice(0, -4)}${state.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`;

    const rAdulterado = await retornar(adulterado, ida.nonce);
    expect(rAdulterado.headers.get('location')).toBe(`${WEB}/perfil?steam=erro&motivo=invalido`);

    const agora = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(agora + 11 * 60_000);
    const rVencido = await retornar(state, ida.nonce);
    spy.mockRestore();
    expect(rVencido.headers.get('location')).toBe(`${WEB}/perfil?steam=erro&motivo=expirado`);
    expect(ctx.db.contas).toHaveLength(0);
    expect(ctx.openId.validarRetorno).not.toHaveBeenCalled();
  });

  it('um ACCESS TOKEN (ou refresh) como state → invalido, sem chamar a Steam (CA-62)', async () => {
    const ida = await iniciar(await ctx.tokenFor(ANA_ID));
    const access = await ctx.tokenFor(ANA_ID);
    const refresh = await ctx.tokens.signRefresh(ANA_ID, 'sessao');

    for (const token of [access, refresh]) {
      const response = await retornar(token, ida.nonce);
      expect(response.headers.get('location')).toBe(`${WEB}/perfil?steam=erro&motivo=invalido`);
    }
    expect(ctx.openId.validarRetorno).not.toHaveBeenCalled();
    expect(ctx.db.contas).toHaveLength(0);
  });

  it.each([
    ['cancelado', new VinculoCanceladoError(), 'cancelado'],
    ['recusado pela Steam', new VinculoRecusadoError(), 'invalido'],
    ['Steam fora do ar', new PlataformaIndisponivelError(), 'indisponivel'],
    ['Steam no limite', new PlataformaLimiteError(), 'indisponivel'],
  ])('%s → 302 com motivo=%s, sem 500 (CA-11, CA-12)', async (_nome, erro, motivo) => {
    const ida = await iniciar(await ctx.tokenFor(ANA_ID));
    ctx.openId.validarRetorno.mockRejectedValue(erro);

    const response = await retornar(ida.state, ida.nonce);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${WEB}/perfil?steam=erro&motivo=${motivo}`);
    expect(ctx.db.contas).toHaveLength(0);
  });

  it('outro SteamID já vinculado → ja-vinculada e o original fica; o mesmo SteamID → sucesso sem duplicar (CA-13)', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    const primeira = await iniciar(token);
    await retornar(primeira.state, primeira.nonce);
    // O vínculo já existe: para testar o retorno, inicia o fluxo direto pelo service (o POST daria 409).
    const emissor = app.get(VinculoStateService);

    const mesma = await emissor.emitir(ANA_ID, 'STEAM');
    const rMesma = await retornar(mesma.state, mesma.nonce);
    expect(rMesma.headers.get('location')).toBe(`${WEB}/perfil?steam=vinculada`);
    expect(ctx.db.contas).toHaveLength(1);

    ctx.openId.validarRetorno.mockResolvedValue('76561190000000001');
    const outra = await emissor.emitir(ANA_ID, 'STEAM');
    const rOutra = await retornar(outra.state, outra.nonce);
    expect(rOutra.headers.get('location')).toBe(`${WEB}/perfil?steam=erro&motivo=ja-vinculada`);
    expect(ctx.db.contas).toEqual([expect.objectContaining({ idExterno: STEAM_ID })]);
  });

  it('GetPlayerSummaries falha no retorno → o vínculo é gravado com o nome "Conta Steam" (CA-14)', async () => {
    const ida = await iniciar(await ctx.tokenFor(ANA_ID));
    ctx.client.obterPerfil.mockRejectedValue(new PlataformaIndisponivelError());

    const response = await retornar(ida.state, ida.nonce);

    expect(response.headers.get('location')).toBe(`${WEB}/perfil?steam=vinculada`);
    expect(ctx.db.contas[0]).toMatchObject({ nomeExibicao: 'Conta Steam' });
  });

  it('o retorno aceita as dezenas de openid.* sem o ValidationPipe recusar (sem DTO de propósito)', async () => {
    const ida = await iniciar(await ctx.tokenFor(ANA_ID));
    const muitos = Array.from({ length: 30 }, (_, i) => `&openid.campo${i}=v${i}`).join('');

    const response = await retornar(ida.state, ida.nonce, muitos);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${WEB}/perfil?steam=vinculada`);
  });

  it('provedor desconhecido no retorno → 400 VALIDACAO (JSON, não é da Steam)', async () => {
    const response = await pedir('GET', '/integracoes/xbox/retorno?state=x');

    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ code: 'VALIDACAO' });
  });
});

describe('o state não vale como access token (CA-61)', () => {
  it.each([
    ['GET', '/integracoes'],
    ['POST', '/integracoes/steam/vinculo'],
    ['GET', '/protegido'],
  ])('um state real no Bearer de %s %s → 401', async (metodo, caminho) => {
    const ida = await iniciar(await ctx.tokenFor(ANA_ID));

    const response = await pedir(metodo, caminho, ida.state);

    expect(response.status).toBe(401);
    expect(await json(response)).toMatchObject({ code: 'AUTH_NAO_AUTENTICADO' });
  });
});

describe('GET /integracoes e o cartão do perfil (CA-16 a CA-21)', () => {
  async function vincular(userId: string): Promise<string> {
    const token = await ctx.tokenFor(userId);
    const ida = await iniciar(token);
    await retornar(ida.state, ida.nonce);
    return token;
  }

  it('lista só a conta do usuário, com os campos do contrato', async () => {
    const token = await vincular(ANA_ID);

    const response = await pedir('GET', '/integracoes', token);

    expect(response.status).toBe(200);
    const corpo = (await response.json()) as Record<string, unknown>[];
    expect(corpo).toHaveLength(1);
    expect(Object.keys(corpo[0] ?? {}).sort()).toEqual([
      'idExterno',
      'nomeExibicao',
      'provedor',
      'vinculadaEm',
    ]);
  });

  it('o cartão: totais, horas, mais jogados, conquistas dos vinculados e cache (CA-16)', async () => {
    const token = await vincular(ANA_ID);
    ctx.db.jogos.push({
      id: 'j1',
      userId: ANA_ID,
      provedor: 'STEAM',
      idExterno: '1',
      conquistasTotal: 40,
      conquistasDesbloqueadas: 12,
    });

    const response = await pedir('GET', '/integracoes/steam/perfil', token);
    const corpo = await json(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(corpo).toMatchObject({
      provedor: 'STEAM',
      nomeExibicao: 'Jogador Sintetico',
      avatarUrl: 'https://avatars.steamstatic.com/0000_full.jpg',
      totalJogos: 3,
      minutosTotais: 1800,
      conquistas: { desbloqueadas: 12, total: 40, jogosVinculados: 1 },
    });
    expect((corpo?.maisJogados as { titulo: string }[]).map((j) => j.titulo)).toEqual([
      'Beta',
      'Alfa',
    ]);
    // O corpo nunca traz o userId nem nada interno.
    expect(JSON.stringify(corpo)).not.toContain(ANA_ID);

    const chamadasAntes = ctx.client.listarJogos.mock.calls.length;
    await pedir('GET', '/integracoes/steam/perfil', token);
    expect(ctx.client.listarJogos.mock.calls.length).toBe(chamadasAntes);
  });

  it('sem conta vinculada → 409 PLATAFORMA_NAO_VINCULADA (CA-17)', async () => {
    const response = await pedir('GET', '/integracoes/steam/perfil', await ctx.tokenFor(ANA_ID));

    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({ code: 'PLATAFORMA_NAO_VINCULADA' });
  });

  it('atualizar duas vezes em menos de 30 s: a 2ª não chama a Steam e devolve o mesmo consultadoEm (CA-18)', async () => {
    const token = await vincular(ANA_ID);

    const a = await json(await pedir('POST', '/integracoes/steam/perfil/atualizacao', token));
    const chamadas = ctx.client.listarJogos.mock.calls.length;
    const respostaB = await pedir('POST', '/integracoes/steam/perfil/atualizacao', token);
    const b = await json(respostaB);

    expect(respostaB.status).toBe(200);
    expect(b?.consultadoEm).toBe(a?.consultadoEm);
    expect(ctx.client.listarJogos.mock.calls.length).toBe(chamadas);
  });

  it('perfil privado → 409 PLATAFORMA_PERFIL_PRIVADO; biblioteca vazia (game_count 0) → 200 com 0 jogos (CA-20)', async () => {
    const token = await vincular(ANA_ID);
    ctx.client.obterPerfil.mockResolvedValue({ ...perfilPublico, visibilidade: 1 });

    const privado = await pedir('GET', '/integracoes/steam/perfil', token);
    expect(privado.status).toBe(409);
    expect(await json(privado)).toMatchObject({ code: 'PLATAFORMA_PERFIL_PRIVADO' });

    ctx.client.obterPerfil.mockResolvedValue(perfilPublico);
    ctx.client.listarJogos.mockResolvedValue({ privada: false, total: 0, jogos: [] });
    const vazio = await pedir('GET', '/integracoes/steam/perfil', token);
    expect(vazio.status).toBe(200);
    expect(await json(vazio)).toMatchObject({ totalJogos: 0, maisJogados: [] });
  });

  it('detalhes do jogo privados (sem game_count) também são 409 PLATAFORMA_PERFIL_PRIVADO', async () => {
    const token = await vincular(ANA_ID);
    ctx.client.listarJogos.mockResolvedValue({ privada: true, total: 0, jogos: [] });

    const response = await pedir('GET', '/integracoes/steam/perfil', token);

    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({ code: 'PLATAFORMA_PERFIL_PRIVADO' });
  });

  it.each([
    ['timeout', new PlataformaIndisponivelError(), 'PLATAFORMA_INDISPONIVEL'],
    ['429 da Steam', new PlataformaLimiteError(), 'PLATAFORMA_LIMITE'],
  ])(
    'a Steam com %s → 502 %s (nunca 500) e o resto do app segue de pé (CA-21)',
    async (_nome, erro, code) => {
      const token = await vincular(ANA_ID);
      ctx.client.listarJogos.mockRejectedValue(erro);

      const response = await pedir('GET', '/integracoes/steam/perfil', token);

      expect(response.status).toBe(502);
      expect(await json(response)).toMatchObject({ statusCode: 502, code });
      expect((await pedir('GET', '/integracoes', token)).status).toBe(200);
      expect((await pedir('GET', '/protegido', token)).status).toBe(200);
    },
  );

  it('um PerfilPrivadoError vindo do provider vira 409, não 500', async () => {
    const token = await vincular(ANA_ID);
    ctx.client.listarJogos.mockRejectedValue(new PerfilPrivadoError());

    expect((await pedir('GET', '/integracoes/steam/perfil', token)).status).toBe(409);
  });
});

describe('DELETE /integracoes/steam (CA-19)', () => {
  it('204: apaga a conta e os dados por provedor; repetir → 409 PLATAFORMA_NAO_VINCULADA', async () => {
    const token = await ctx.tokenFor(ANA_ID);
    const ida = await iniciar(token);
    await retornar(ida.state, ida.nonce);
    ctx.db.jogos.push(
      {
        id: 'j1',
        userId: ANA_ID,
        provedor: 'STEAM',
        idExterno: '1',
        conquistasTotal: 1,
        conquistasDesbloqueadas: 1,
      },
      {
        id: 'j2',
        userId: ANA_ID,
        provedor: 'STEAM',
        idExterno: '2',
        conquistasTotal: 1,
        conquistasDesbloqueadas: 0,
      },
    );

    const response = await pedir('DELETE', '/integracoes/steam', token);

    expect(response.status).toBe(204);
    expect(ctx.db.contas).toHaveLength(0);
    expect(ctx.db.jogos).toHaveLength(0);
    const repetido = await pedir('DELETE', '/integracoes/steam', token);
    expect(repetido.status).toBe(409);
    expect(await json(repetido)).toMatchObject({ code: 'PLATAFORMA_NAO_VINCULADA' });
  });

  it('provedor desconhecido → 400', async () => {
    const response = await pedir('DELETE', '/integracoes/xbox', await ctx.tokenFor(ANA_ID));

    expect(response.status).toBe(400);
  });
});

describe('a mesma conta Steam em duas contas do checkpoint (CA-65)', () => {
  it('as duas vinculam sem conflito, cada uma vê só a sua, e desvincular uma não mexe na outra', async () => {
    const ana = await ctx.tokenFor(ANA_ID);
    const bia = await ctx.tokenFor(BIA_ID);
    const idaAna = await iniciar(ana);
    const idaBia = await iniciar(bia);

    const rAna = await retornar(idaAna.state, idaAna.nonce);
    const rBia = await retornar(idaBia.state, idaBia.nonce);

    expect(rAna.headers.get('location')).toBe(`${WEB}/perfil?steam=vinculada`);
    expect(rBia.headers.get('location')).toBe(`${WEB}/perfil?steam=vinculada`);
    expect(ctx.db.contas.map((c) => [c.userId, c.idExterno])).toEqual([
      [ANA_ID, STEAM_ID],
      [BIA_ID, STEAM_ID],
    ]);
    expect(((await (await pedir('GET', '/integracoes', ana)).json()) as unknown[]).length).toBe(1);
    expect(((await (await pedir('GET', '/integracoes', bia)).json()) as unknown[]).length).toBe(1);

    ctx.db.jogos.push({
      id: 'jb',
      userId: BIA_ID,
      provedor: 'STEAM',
      idExterno: '1',
      conquistasTotal: 5,
      conquistasDesbloqueadas: 1,
    });
    expect((await pedir('DELETE', '/integracoes/steam', ana)).status).toBe(204);

    expect(ctx.db.contas.map((c) => c.userId)).toEqual([BIA_ID]);
    expect(ctx.db.jogos.map((j) => j.userId)).toEqual([BIA_ID]);
  });
});

describe('o redirecionamento e o log não vazam o SteamID nem o state (CA-58)', () => {
  it('em todos os desfechos (sucesso e cada motivo de erro)', async () => {
    const locations: string[] = [];
    const states: string[] = [];
    const nonces: string[] = [];

    const cenarios: (() => void)[] = [
      () => ctx.openId.validarRetorno.mockResolvedValue(STEAM_ID),
      () => ctx.openId.validarRetorno.mockRejectedValue(new VinculoCanceladoError()),
      () => ctx.openId.validarRetorno.mockRejectedValue(new VinculoRecusadoError()),
      () => ctx.openId.validarRetorno.mockRejectedValue(new PlataformaIndisponivelError()),
    ];
    for (const preparar of cenarios) {
      const userId = `${ANA_ID.slice(0, -1)}${cenarios.indexOf(preparar)}`;
      const ida = await iniciar(await ctx.tokenFor(userId));
      states.push(ida.state ?? '');
      nonces.push(ida.nonce ?? '');
      preparar();
      const response = await retornar(
        ida.state,
        ida.nonce,
        `&openid.claimed_id=https://steamcommunity.com/openid/id/${STEAM_ID}`,
      );
      locations.push(response.headers.get('location') ?? '');
    }
    // Um state ruim e um sem cookie também.
    const ruim = await iniciar(await ctx.tokenFor(BIA_ID));
    locations.push((await retornar('lixo', ruim.nonce)).headers.get('location') ?? '');
    locations.push((await retornar(ruim.state, undefined)).headers.get('location') ?? '');

    expect(locations.length).toBeGreaterThanOrEqual(6);
    for (const location of locations) {
      expect(location).not.toContain(STEAM_ID);
      for (const state of states) {
        expect(location).not.toContain(state);
      }
      expect(location).toMatch(
        /^http:\/\/localhost:5173\/perfil\?steam=(vinculada|erro&motivo=[a-z-]+)$/,
      );
    }
    const logs = ctx.logger.lines.join('\n');
    expect(logs).not.toContain(STEAM_ID);
    for (const segredo of [...states, ...nonces]) {
      expect(segredo).not.toBe('');
      expect(logs).not.toContain(segredo);
    }
    expect(logs).not.toContain('checkpoint_vinculo');
    expect(logs).not.toMatch(/key=[0-9a-f]{32}/i);
  });
});
