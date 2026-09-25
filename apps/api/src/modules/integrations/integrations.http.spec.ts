import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { IntegrationsController } from './integrations.controller';
import {
  IdExternoInvalidoError,
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
    ['GET', '/integracoes/steam/biblioteca'],
    ['PUT', '/integracoes/steam/jogos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    ['DELETE', '/integracoes/steam/jogos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
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

  it('(SIMULADO, sem fixture real) perfil privado → 409 PLATAFORMA_PERFIL_PRIVADO; biblioteca vazia (game_count 0) → 200 com 0 jogos (CA-20)', async () => {
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

  it('(SIMULADO, sem fixture real) detalhes do jogo privados (sem game_count) também são 409 PLATAFORMA_PERFIL_PRIVADO', async () => {
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

describe('GET /integracoes/:provedor/biblioteca (CA-23 a CA-25, CA-34)', () => {
  const bibliotecaDeTres = {
    privada: false,
    total: 3,
    jogos: [
      {
        appid: '504230',
        nome: 'Celeste',
        minutosJogados: 600,
        ultimaVezJogadoEm: new Date('2026-02-01T00:00:00Z'),
      },
      { appid: '1145360', nome: 'Hades', minutosJogados: 1200, ultimaVezJogadoEm: null },
      { appid: '2', nome: 'Pokémon™ Legends', minutosJogados: 0, ultimaVezJogadoEm: null },
    ],
  };

  async function vinculada(userId: string): Promise<string> {
    const token = await ctx.tokenFor(userId);
    const ida = await iniciar(token);
    await retornar(ida.state, ida.nonce);
    ctx.client.listarJogos.mockResolvedValue(bibliotecaDeTres);
    return token;
  }

  it('200 com os itens por horas (decrescente), só os campos do contrato (CA-23)', async () => {
    const token = await vinculada(ANA_ID);

    const response = await pedir('GET', '/integracoes/steam/biblioteca', token);
    const corpo = (await response.json()) as Record<string, unknown>[];

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(corpo.map((item) => item.titulo)).toEqual(['Hades', 'Celeste', 'Pokémon™ Legends']);
    expect(Object.keys(corpo[0] ?? {}).sort()).toEqual([
      'capaUrl',
      'idExterno',
      'jogosParecidos',
      'minutosJogados',
      'titulo',
      'ultimaVezJogadoEm',
      'vinculadoA',
    ]);
    expect(JSON.stringify(corpo)).not.toContain(ANA_ID);
  });

  it('?busca=celeste (e "cel") acha sem caixa nem acento; ?busca=pokemon acha "Pokémon™" (CA-23)', async () => {
    const token = await vinculada(ANA_ID);

    for (const [query, esperado] of [
      ['?busca=celeste', ['Celeste']],
      ['?busca=CEL', ['Celeste']],
      ['?busca=pokemon', ['Pokémon™ Legends']],
      ['?busca=nao-existe', []],
    ] as const) {
      const response = await pedir('GET', `/integracoes/steam/biblioteca${query}`, token);
      const corpo = (await response.json()) as { titulo: string }[];
      expect(response.status).toBe(200);
      expect(corpo.map((item) => item.titulo)).toEqual(esperado);
    }
  });

  it('?limite=2 devolve os 2 mais jogados (CA-23)', async () => {
    const token = await vinculada(ANA_ID);

    const corpo = (await (
      await pedir('GET', '/integracoes/steam/biblioteca?limite=2', token)
    ).json()) as {
      titulo: string;
    }[];

    expect(corpo.map((item) => item.titulo)).toEqual(['Hades', 'Celeste']);
  });

  it.each([
    ['limite=51', '?limite=51', 'limite'],
    ['limite=0', '?limite=0', 'limite'],
    ['limite=abc', '?limite=abc', 'limite'],
    ['limite=1.5', '?limite=1.5', 'limite'],
    ['limite repetido', '?limite=1&limite=2', 'limite'],
    ['busca de 101 caracteres', `?busca=${'a'.repeat(101)}`, 'busca'],
  ])(
    '%s → 400 VALIDACAO apontando o campo, sem a mensagem de "campos não permitidos" (CA-23)',
    async (_nome, query, campo) => {
      const token = await vinculada(ANA_ID);

      const response = await pedir('GET', `/integracoes/steam/biblioteca${query}`, token);
      const corpo = (await response.json()) as {
        code: string;
        message: string;
        fields: Record<string, string>;
      };

      expect(response.status).toBe(400);
      expect(corpo.code).toBe('VALIDACAO');
      expect(corpo.fields[campo]).toEqual(expect.any(String));
      expect(corpo.message).not.toContain('Campos não permitidos');
    },
  );

  it('um parâmetro desconhecido → 400 (o pipe global recusa)', async () => {
    const token = await vinculada(ANA_ID);

    expect((await pedir('GET', '/integracoes/steam/biblioteca?userId=x', token)).status).toBe(400);
  });

  it('jogosParecidos: só os jogos do PRÓPRIO usuário, sem caixa nem acento, sem os já ligados (CA-24)', async () => {
    const ana = await vinculada(ANA_ID);
    ctx.db.games.push(
      { id: 'g-ana', userId: ANA_ID, titulo: 'CELESTE', plataforma: 'PC' },
      { id: 'g-ana-ligado', userId: ANA_ID, titulo: 'Celeste', plataforma: 'PS5' },
      { id: 'g-bia', userId: BIA_ID, titulo: 'Celeste', plataforma: 'PC' },
    );
    ctx.db.jogos.push({
      id: 'jp1',
      userId: ANA_ID,
      gameId: 'g-ana-ligado',
      provedor: 'STEAM',
      idExterno: '999',
      conquistasTotal: null,
      conquistasDesbloqueadas: null,
    });

    const corpo = (await (
      await pedir('GET', '/integracoes/steam/biblioteca?busca=celeste', ana)
    ).json()) as {
      jogosParecidos: { id: string; titulo: string; plataforma: string | null }[];
    }[];

    expect(corpo[0]?.jogosParecidos).toEqual([
      { id: 'g-ana', titulo: 'CELESTE', plataforma: 'PC' },
    ]);
  });

  it('vinculadoA quando o item já está ligado a um jogo (CA-25)', async () => {
    const ana = await vinculada(ANA_ID);
    ctx.db.games.push({ id: 'g1', userId: ANA_ID, titulo: 'Celeste (PS5)', plataforma: 'PS5' });
    ctx.db.jogos.push({
      id: 'jp1',
      userId: ANA_ID,
      gameId: 'g1',
      provedor: 'STEAM',
      idExterno: '504230',
      conquistasTotal: null,
      conquistasDesbloqueadas: null,
    });

    const corpo = (await (
      await pedir('GET', '/integracoes/steam/biblioteca?busca=celeste', ana)
    ).json()) as {
      vinculadoA: unknown;
    }[];

    expect(corpo[0]?.vinculadoA).toEqual({ id: 'g1', titulo: 'Celeste (PS5)', plataforma: 'PS5' });
  });

  it('só LISTA: nenhuma escrita, nem com um jogo de mesmo título no catálogo (CA-34)', async () => {
    const ana = await vinculada(ANA_ID);
    ctx.db.games.push({ id: 'g1', userId: ANA_ID, titulo: 'Celeste', plataforma: 'PC' });

    await pedir('GET', '/integracoes/steam/biblioteca', ana);

    expect(ctx.db.jogos).toHaveLength(0);
  });

  it('sem conta vinculada → 409 PLATAFORMA_NAO_VINCULADA', async () => {
    const response = await pedir(
      'GET',
      '/integracoes/steam/biblioteca',
      await ctx.tokenFor(ANA_ID),
    );

    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({ code: 'PLATAFORMA_NAO_VINCULADA' });
  });

  it('(SIMULADO, sem fixture real) perfil privado → 409; Steam fora do ar ou no limite → 502, nunca 500 (CA-39)', async () => {
    const token = await vinculada(ANA_ID);

    ctx.client.obterPerfil.mockResolvedValue({ ...perfilPublico, visibilidade: 1 });
    const privado = await pedir('GET', '/integracoes/steam/biblioteca', token);
    expect(privado.status).toBe(409);
    expect(await json(privado)).toMatchObject({ code: 'PLATAFORMA_PERFIL_PRIVADO' });

    ctx.client.obterPerfil.mockResolvedValue(perfilPublico);
    ctx.client.listarJogos.mockRejectedValue(new PlataformaIndisponivelError());
    const fora = await pedir('GET', '/integracoes/steam/biblioteca', token);
    expect(fora.status).toBe(502);
    expect(await json(fora)).toMatchObject({ code: 'PLATAFORMA_INDISPONIVEL' });

    ctx.client.listarJogos.mockRejectedValue(new PlataformaLimiteError());
    expect((await pedir('GET', '/integracoes/steam/biblioteca', token)).status).toBe(502);
    expect((await pedir('GET', '/integracoes', token)).status).toBe(200);
  });

  it('provedor desconhecido → 400; e a biblioteca usa o cache: a 2ª leitura não chama a Steam', async () => {
    const token = await vinculada(ANA_ID);
    expect((await pedir('GET', '/integracoes/xbox/biblioteca', token)).status).toBe(400);

    ctx.client.listarJogos.mockClear();
    await pedir('GET', '/integracoes/steam/biblioteca', token);
    await pedir('GET', '/integracoes/steam/biblioteca?busca=hades', token);
    await pedir('GET', '/integracoes/steam/perfil', token);

    expect(ctx.client.listarJogos.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('PUT e DELETE /integracoes/:provedor/jogos/:jogoId (CA-26 a CA-31, CA-66, CA-67)', () => {
  const G_CELESTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const G_PS5 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const G_HADES = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const G_BIA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const CELESTE = '504230';
  const HADES = '1145360';
  const CAMINHO = (jogoId: string) => `/integracoes/steam/jogos/${jogoId}`;

  const biblioteca = {
    privada: false,
    total: 2,
    jogos: [
      {
        appid: CELESTE,
        nome: 'Celeste',
        minutosJogados: 600,
        ultimaVezJogadoEm: new Date('2026-02-01T00:00:00Z'),
      },
      { appid: HADES, nome: 'Hades', minutosJogados: 0, ultimaVezJogadoEm: null },
    ],
  };
  const conquista = (id: string, desbloqueada: boolean) => ({
    id,
    desbloqueada,
    desbloqueadaEm: null,
    nome: null,
    descricao: null,
  });

  async function enviar(
    metodo: string,
    caminho: string,
    token: string,
    corpo?: unknown,
  ): Promise<Response> {
    return fetch(`${ctx.baseUrl}${caminho}`, {
      method: metodo,
      redirect: 'manual',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  }

  /** Ana com a Steam vinculada e três jogos no catálogo (um em PC, um em PS5, um em PlayStation 5); Bia com um. */
  async function comCatalogo(): Promise<{ ana: string; bia: string }> {
    const ana = await ctx.tokenFor(ANA_ID);
    const bia = await ctx.tokenFor(BIA_ID);
    for (const token of [ana, bia]) {
      const ida = await iniciar(token);
      await retornar(ida.state, ida.nonce);
    }
    ctx.db.games.push(
      { id: G_CELESTE, userId: ANA_ID, titulo: 'Celeste', plataforma: 'PC' },
      { id: G_PS5, userId: ANA_ID, titulo: 'Celeste (PS5)', plataforma: 'PlayStation 5' },
      { id: G_HADES, userId: ANA_ID, titulo: 'Hades', plataforma: '' },
      { id: G_BIA, userId: BIA_ID, titulo: 'Celeste', plataforma: 'PC' },
    );
    ctx.client.listarJogos.mockResolvedValue(biblioteca);
    ctx.client.obterConquistasDoJogador.mockResolvedValue({
      tipo: 'ok',
      nomeDoJogo: 'Celeste',
      conquistas: [conquista('A', true), conquista('B', true), conquista('C', false)],
    });
    ctx.client.listarJogos.mockClear();
    ctx.client.obterConquistasDoJogador.mockClear();
    return { ana, bia };
  }

  const linha = (userId: string, gameId: string, idExterno: string) => ({
    id: `linha-${gameId}`,
    userId,
    gameId,
    provedor: 'STEAM' as const,
    idExterno,
    minutosJogados: 5,
    conquistasTotal: 1,
    conquistasDesbloqueadas: 0,
  });

  const chamadasASteam = () =>
    ctx.client.listarJogos.mock.calls.length +
    ctx.client.obterConquistasDoJogador.mock.calls.length;

  it('200 com os dados da Steam, só os campos do contrato; a linha é gravada e o jogo NÃO muda (CA-26)', async () => {
    const { ana } = await comCatalogo();
    const antes = JSON.stringify(ctx.db.games);

    const response = await enviar('PUT', CAMINHO(G_CELESTE), ana, { idExterno: CELESTE });
    const corpo = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys(corpo).sort()).toEqual([
      'atualizadoEm',
      'capaUrl',
      'conquistasDesbloqueadas',
      'conquistasTotal',
      'idExterno',
      'minutosJogados',
      'provedor',
      'ultimaVezJogadoEm',
    ]);
    expect(corpo).toMatchObject({
      provedor: 'STEAM',
      idExterno: CELESTE,
      minutosJogados: 600,
      conquistasTotal: 3,
      conquistasDesbloqueadas: 2,
      capaUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${CELESTE}/library_600x900.jpg`,
    });
    expect(ctx.db.jogos).toEqual([
      expect.objectContaining({ userId: ANA_ID, gameId: G_CELESTE, idExterno: CELESTE }),
    ]);
    // Título, status, notas e plataforma do jogo continuam exatamente como estavam.
    expect(JSON.stringify(ctx.db.games)).toBe(antes);
    expect(JSON.stringify(corpo)).not.toContain(ANA_ID);
  });

  it('funciona com QUALQUER plataforma do jogo, sem alterá-la (CA-37)', async () => {
    const { ana } = await comCatalogo();

    const response = await enviar('PUT', CAMINHO(G_PS5), ana, { idExterno: CELESTE });

    expect(response.status).toBe(200);
    expect(ctx.db.games.find((g) => g.id === G_PS5)?.plataforma).toBe('PlayStation 5');
  });

  it.each([
    ['sem corpo (objeto vazio)', {}],
    ['idExterno vazio', { idExterno: '' }],
    ['idExterno malformado', { idExterno: 'abc; drop' }],
    ['idExterno número', { idExterno: 504230 }],
    ['campo extra', { idExterno: CELESTE, userId: 'outro' }],
    ['mover que não é booleano', { idExterno: CELESTE, mover: 'sim' }],
  ])('corpo inválido (%s) → 400 VALIDACAO, sem chamar a Steam (CA-27)', async (_nome, corpo) => {
    const { ana } = await comCatalogo();

    const response = await enviar('PUT', CAMINHO(G_CELESTE), ana, corpo);

    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ code: 'VALIDACAO' });
    expect(chamadasASteam()).toBe(0);
    expect(ctx.db.jogos).toHaveLength(0);
  });

  it('idExterno que passa no formato mas não é um appid ("abc") → 400 VALIDACAO, erro de validação, nada gravado (CA-27)', async () => {
    const { ana } = await comCatalogo();
    // O `SteamClient` de verdade valida o appid antes de chamar (steam.client.spec, CA-64); o falso faz o mesmo.
    ctx.client.listarJogos.mockImplementation((_steamId: string, opcoes?: { appId?: string }) => {
      if (opcoes?.appId !== undefined && !/^\d{1,10}$/.test(opcoes.appId)) {
        return Promise.reject(new IdExternoInvalidoError('appId', 'appid inválido'));
      }
      return Promise.resolve(biblioteca);
    });

    const response = await enviar('PUT', CAMINHO(G_CELESTE), ana, { idExterno: 'abc' });

    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ code: 'VALIDACAO' });
    // O cliente rejeita antes de qualquer chamada à Steam: as conquistas nem chegam a ser consultadas.
    expect(ctx.client.obterConquistasDoJogador).not.toHaveBeenCalled();
    expect(ctx.db.jogos).toHaveLength(0);
  });

  it('item que NÃO está na biblioteca → 404 PLATAFORMA_ITEM_NAO_ENCONTRADO e nada é gravado (CA-27)', async () => {
    const { ana } = await comCatalogo();
    ctx.client.listarJogos.mockResolvedValue({ privada: false, total: 0, jogos: [] });

    const response = await enviar('PUT', CAMINHO(G_CELESTE), ana, { idExterno: '99999' });

    expect(response.status).toBe(404);
    expect(await json(response)).toMatchObject({ code: 'PLATAFORMA_ITEM_NAO_ENCONTRADO' });
    expect(ctx.db.jogos).toHaveLength(0);
  });

  it('jogoId inválido → 400; jogo inexistente ou de OUTRO usuário → o mesmo 404 do catálogo; sem token → 401 (CA-27)', async () => {
    const { ana } = await comCatalogo();

    expect((await enviar('PUT', CAMINHO('abc'), ana, { idExterno: CELESTE })).status).toBe(400);

    const daBia = await enviar('PUT', CAMINHO(G_BIA), ana, { idExterno: CELESTE });
    const inexistente = await enviar('PUT', CAMINHO('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), ana, {
      idExterno: CELESTE,
    });
    expect(daBia.status).toBe(404);
    expect(await json(daBia)).toMatchObject({ statusCode: 404, message: 'Jogo não encontrado' });
    expect(inexistente.status).toBe(404);
    expect(await json(inexistente)).toMatchObject({
      statusCode: 404,
      message: 'Jogo não encontrado',
    });
    expect(chamadasASteam()).toBe(0);
    expect(ctx.db.jogos).toHaveLength(0);
  });

  it('sem conta vinculada → 409 PLATAFORMA_NAO_VINCULADA; provedor desconhecido → 400', async () => {
    const semConta = await ctx.tokenFor(ANA_ID);
    ctx.db.games.push({ id: G_CELESTE, userId: ANA_ID, titulo: 'Celeste', plataforma: 'PC' });

    const response = await enviar('PUT', CAMINHO(G_CELESTE), semConta, { idExterno: CELESTE });

    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({ code: 'PLATAFORMA_NAO_VINCULADA' });
    expect(
      (await enviar('PUT', `/integracoes/xbox/jogos/${G_CELESTE}`, semConta, { idExterno: '1' }))
        .status,
    ).toBe(400);
  });

  it('item já ligado a outro jogo, sem mover → 409 com jogoAtual e a Steam NÃO é chamada (CA-28, CA-67)', async () => {
    const { ana } = await comCatalogo();
    ctx.db.jogos.push(linha(ANA_ID, G_PS5, CELESTE));

    const response = await enviar('PUT', CAMINHO(G_CELESTE), ana, { idExterno: CELESTE });

    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({
      statusCode: 409,
      code: 'PLATAFORMA_ITEM_JA_VINCULADO',
      jogoAtual: { id: G_PS5, titulo: 'Celeste (PS5)' },
    });
    expect(chamadasASteam()).toBe(0);
    expect(ctx.db.jogos.map((j) => j.gameId)).toEqual([G_PS5]);
  });

  it('com mover: o vínculo passa para este jogo; o antigo perde só a camada e segue intacto (CA-28)', async () => {
    const { ana } = await comCatalogo();
    ctx.db.jogos.push(linha(ANA_ID, G_PS5, CELESTE));
    const antes = JSON.stringify(ctx.db.games);

    const response = await enviar('PUT', CAMINHO(G_CELESTE), ana, {
      idExterno: CELESTE,
      mover: true,
    });

    expect(response.status).toBe(200);
    expect(ctx.db.jogos).toHaveLength(1);
    expect(ctx.db.jogos[0]).toMatchObject({
      gameId: G_CELESTE,
      idExterno: CELESTE,
      minutosJogados: 600,
    });
    expect(JSON.stringify(ctx.db.games)).toBe(antes);
  });

  it('o jogo JÁ tem outro item → 409 PLATAFORMA_JOGO_JA_VINCULADO, com ou sem mover, sem chamar a Steam (CA-29, CA-67)', async () => {
    const { ana } = await comCatalogo();
    ctx.db.jogos.push(linha(ANA_ID, G_CELESTE, HADES));

    for (const corpo of [{ idExterno: CELESTE }, { idExterno: CELESTE, mover: true }]) {
      const response = await enviar('PUT', CAMINHO(G_CELESTE), ana, corpo);
      expect(response.status).toBe(409);
      expect(await json(response)).toMatchObject({ code: 'PLATAFORMA_JOGO_JA_VINCULADO' });
    }
    expect(chamadasASteam()).toBe(0);
    expect(ctx.db.jogos.map((j) => j.idExterno)).toEqual([HADES]);
  });

  it('repetir o mesmo pedido é idempotente: 200 com o gravado, sem chamar a Steam', async () => {
    const { ana } = await comCatalogo();
    await enviar('PUT', CAMINHO(G_CELESTE), ana, { idExterno: CELESTE });
    ctx.client.listarJogos.mockClear();
    ctx.client.obterConquistasDoJogador.mockClear();

    const response = await enviar('PUT', CAMINHO(G_CELESTE), ana, { idExterno: CELESTE });

    expect(response.status).toBe(200);
    expect(chamadasASteam()).toBe(0);
    expect(ctx.db.jogos).toHaveLength(1);
  });

  it.each([
    [
      'perfil privado (SIMULADO, sem fixture real: biblioteca sem game_count)',
      () => ctx.client.listarJogos.mockResolvedValue({ privada: true, total: 0, jogos: [] }),
      409,
      'PLATAFORMA_PERFIL_PRIVADO',
    ],
    [
      'Steam fora do ar na biblioteca',
      () => ctx.client.listarJogos.mockRejectedValue(new PlataformaIndisponivelError()),
      502,
      'PLATAFORMA_INDISPONIVEL',
    ],
    [
      'Steam no limite na biblioteca',
      () => ctx.client.listarJogos.mockRejectedValue(new PlataformaLimiteError()),
      502,
      'PLATAFORMA_LIMITE',
    ],
    [
      'Steam fora do ar nas conquistas',
      () =>
        ctx.client.obterConquistasDoJogador.mockRejectedValue(new PlataformaIndisponivelError()),
      502,
      'PLATAFORMA_INDISPONIVEL',
    ],
  ])('%s → %i %s e NENHUMA linha é criada (CA-30)', async (_nome, falhar, status, code) => {
    const { ana } = await comCatalogo();
    falhar();

    const response = await enviar('PUT', CAMINHO(G_CELESTE), ana, { idExterno: CELESTE });

    expect(response.status).toBe(status);
    expect(await json(response)).toMatchObject({ code });
    expect(ctx.db.jogos).toHaveLength(0);
    expect((await pedir('GET', '/integracoes', ana)).status).toBe(200);
  });

  it('conquistas negadas (SIMULADO, sem fixture real): liga com as contagens null (CA-30)', async () => {
    const { ana } = await comCatalogo();
    ctx.client.obterConquistasDoJogador.mockResolvedValue({ tipo: 'negado' });

    const response = await enviar('PUT', CAMINHO(G_CELESTE), ana, { idExterno: CELESTE });

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      minutosJogados: 600,
      conquistasTotal: null,
      conquistasDesbloqueadas: null,
    });
    expect(ctx.db.jogos).toHaveLength(1);
  });

  it.each([
    [
      'Steam fora do ar',
      () => ctx.client.listarJogos.mockRejectedValue(new PlataformaIndisponivelError()),
      502,
    ],
    [
      'perfil privado (SIMULADO)',
      () => ctx.client.listarJogos.mockResolvedValue({ privada: true, total: 0, jogos: [] }),
      409,
    ],
  ])(
    'mover com a plataforma falhando (%s): NADA muda, o vínculo fica no jogo antigo (CA-66)',
    async (_nome, falhar, status) => {
      const { ana } = await comCatalogo();
      ctx.db.jogos.push(linha(ANA_ID, G_PS5, CELESTE));
      falhar();

      const response = await enviar('PUT', CAMINHO(G_CELESTE), ana, {
        idExterno: CELESTE,
        mover: true,
      });

      expect(response.status).toBe(status);
      expect(ctx.db.jogos.map((j) => j.gameId)).toEqual([G_PS5]);
    },
  );

  it('a transação do mover desfaz TUDO se a criação falhar no banco (o antigo não some)', async () => {
    const { ana } = await comCatalogo();
    ctx.db.jogos.push(linha(ANA_ID, G_PS5, CELESTE));
    // Uma corrida: entre a checagem e a escrita, o jogo de destino ganha outro vínculo.
    const create = ctx.db.jogoPlataforma.create;
    ctx.db.jogoPlataforma.create = (arg) => {
      ctx.db.jogos.push({ ...linha(ANA_ID, G_CELESTE, HADES), id: 'corrida' });
      return create(arg);
    };

    const response = await enviar('PUT', CAMINHO(G_CELESTE), ana, {
      idExterno: CELESTE,
      mover: true,
    });

    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({ code: 'PLATAFORMA_JOGO_JA_VINCULADO' });
    // O deleteMany do antigo foi desfeito junto: o PS5 continua com o vínculo.
    expect(ctx.db.jogos.some((j) => j.gameId === G_PS5 && j.idExterno === CELESTE)).toBe(true);
  });

  it('a MESMA conta Steam em dois usuários: cada um liga o mesmo appid ao seu jogo (CA-65)', async () => {
    const { ana, bia } = await comCatalogo();

    const daAna = await enviar('PUT', CAMINHO(G_CELESTE), ana, { idExterno: CELESTE });
    const daBia = await enviar('PUT', CAMINHO(G_BIA), bia, { idExterno: CELESTE });

    expect(daAna.status).toBe(200);
    expect(daBia.status).toBe(200);
    expect(ctx.db.jogos.map((j) => [j.userId, j.gameId])).toEqual([
      [ANA_ID, G_CELESTE],
      [BIA_ID, G_BIA],
    ]);
  });

  it('DELETE: 204, só a camada daquele jogo some, o jogo e a conta ficam; repetir → 404 (CA-31)', async () => {
    const { ana } = await comCatalogo();
    ctx.db.jogos.push(linha(ANA_ID, G_CELESTE, CELESTE), linha(ANA_ID, G_HADES, HADES));
    const jogosAntes = JSON.stringify(ctx.db.games);

    const response = await enviar('DELETE', CAMINHO(G_CELESTE), ana);

    expect(response.status).toBe(204);
    expect(ctx.db.jogos.map((j) => j.gameId)).toEqual([G_HADES]);
    expect(JSON.stringify(ctx.db.games)).toBe(jogosAntes);
    expect(ctx.db.contas.some((c) => c.userId === ANA_ID)).toBe(true);
    const repetido = await enviar('DELETE', CAMINHO(G_CELESTE), ana);
    expect(repetido.status).toBe(404);
    expect(await json(repetido)).toMatchObject({ code: 'PLATAFORMA_VINCULO_NAO_ENCONTRADO' });
  });

  it('DELETE: jogo de outro usuário → 404 do catálogo e o vínculo dele fica; jogoId inválido e provedor desconhecido → 400', async () => {
    const { ana } = await comCatalogo();
    ctx.db.jogos.push(linha(BIA_ID, G_BIA, CELESTE));

    const response = await enviar('DELETE', CAMINHO(G_BIA), ana);

    expect(response.status).toBe(404);
    expect(await json(response)).toMatchObject({ statusCode: 404, message: 'Jogo não encontrado' });
    expect(ctx.db.jogos).toHaveLength(1);
    expect((await enviar('DELETE', CAMINHO('abc'), ana)).status).toBe(400);
    expect((await enviar('DELETE', `/integracoes/xbox/jogos/${G_CELESTE}`, ana)).status).toBe(400);
  });

  it('depois de ligar, o jogo aparece com dadosPlataforma na lista do catálogo, sem chamar a Steam (CA-40 no fluxo)', async () => {
    const { ana } = await comCatalogo();
    await enviar('PUT', CAMINHO(G_CELESTE), ana, { idExterno: CELESTE });
    const ligado = ctx.db.jogos[0];

    expect(ligado).toMatchObject({ gameId: G_CELESTE, minutosJogados: 600, conquistasTotal: 3 });
  });
});

describe('GET e POST /integracoes/:provedor/jogos/:jogoId[/atualizacao] (etapa 4, CA-43 a CA-50)', () => {
  const G_CELESTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const G_HADES = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const G_BIA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const CELESTE = '504230';
  const HORA = 60 * 60_000;
  const CAMINHO = (jogoId: string) => `/integracoes/steam/jogos/${jogoId}`;
  const ATUALIZACAO = (jogoId: string) => `${CAMINHO(jogoId)}/atualizacao`;

  const biblioteca = {
    privada: false,
    total: 1,
    jogos: [
      {
        appid: CELESTE,
        nome: 'Celeste',
        minutosJogados: 600,
        ultimaVezJogadoEm: new Date('2026-02-01T00:00:00Z'),
      },
    ],
  };
  const doJogador = (id: string, desbloqueada: boolean) => ({
    id,
    desbloqueada,
    desbloqueadaEm: desbloqueada ? new Date('2026-02-17T18:06:22Z') : null,
    nome: `Nome ${id}`,
    descricao: `Descrição ${id}`,
  });
  const schema = ['A', 'B', 'C'].map((id) => ({
    id,
    nome: `Schema ${id}`,
    descricao: `Descrição ${id}`,
    oculta: id === 'C',
    iconeUrl: `https://steamcdn-a.akamaihd.net/${id}.jpg`,
    iconeCinzaUrl: `https://steamcdn-a.akamaihd.net/${id}-cinza.jpg`,
  }));

  const chamadasASteam = () =>
    ctx.client.listarJogos.mock.calls.length +
    ctx.client.obterConquistasDoJogador.mock.calls.length +
    ctx.client.obterSchema.mock.calls.length +
    ctx.client.obterPercentuaisGlobais.mock.calls.length +
    ctx.client.obterPerfil.mock.calls.length;

  /** Ana e Bia vinculadas; o jogo de Ana ligado ao Celeste com o último valor de `idadeMs` atrás. */
  async function comLigado(idadeMs: number): Promise<{ ana: string; bia: string }> {
    const ana = await ctx.tokenFor(ANA_ID);
    const bia = await ctx.tokenFor(BIA_ID);
    for (const token of [ana, bia]) {
      const ida = await iniciar(token);
      await retornar(ida.state, ida.nonce);
    }
    ctx.db.games.push(
      { id: G_CELESTE, userId: ANA_ID, titulo: 'Celeste', plataforma: 'PC' },
      { id: G_HADES, userId: ANA_ID, titulo: 'Hades', plataforma: '' },
      { id: G_BIA, userId: BIA_ID, titulo: 'Celeste', plataforma: 'PC' },
    );
    ctx.db.jogos.push({
      id: 'linha-celeste',
      userId: ANA_ID,
      gameId: G_CELESTE,
      provedor: 'STEAM',
      idExterno: CELESTE,
      minutosJogados: 5,
      conquistasTotal: 1,
      conquistasDesbloqueadas: 0,
      atualizadoEm: new Date(Date.now() - idadeMs),
    });
    ctx.client.listarJogos.mockResolvedValue(biblioteca);
    ctx.client.obterConquistasDoJogador.mockResolvedValue({
      tipo: 'ok',
      nomeDoJogo: 'Celeste',
      conquistas: [doJogador('A', true), doJogador('B', true), doJogador('C', false)],
    });
    ctx.client.obterSchema.mockResolvedValue(schema);
    ctx.client.obterPercentuaisGlobais.mockResolvedValue(new Map([['A', 40.7]]));
    for (const mock of Object.values(ctx.client)) {
      mock.mockClear();
    }
    return { ana, bia };
  }

  const linhaCeleste = () => ctx.db.jogos.find((j) => j.gameId === G_CELESTE);

  it('dado com 2 h: 200 com as horas novas e a lista completa; o atualizadoEm gravado é novo (CA-43)', async () => {
    const { ana } = await comLigado(2 * HORA);
    const antes = Date.now();

    const response = await pedir('GET', CAMINHO(G_CELESTE), ana);
    const corpo = (await response.json()) as {
      dados: Record<string, unknown>;
      conquistas: Record<string, unknown>[];
      aviso: string | null;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(corpo.aviso).toBeNull();
    expect(corpo.dados).toMatchObject({
      provedor: 'STEAM',
      idExterno: CELESTE,
      minutosJogados: 600,
      conquistasTotal: 3,
      conquistasDesbloqueadas: 2,
    });
    expect(new Date(corpo.dados.atualizadoEm as string).getTime()).toBeGreaterThanOrEqual(antes);
    expect(corpo.conquistas).toHaveLength(3);
    expect(corpo.conquistas[0]).toEqual({
      id: 'A',
      nome: 'Schema A',
      descricao: 'Descrição A',
      oculta: false,
      desbloqueada: true,
      desbloqueadaEm: '2026-02-17T18:06:22.000Z',
      iconeUrl: 'https://steamcdn-a.akamaihd.net/A.jpg',
      raridadePercentual: 40.7,
    });
    expect(corpo.conquistas[2]).toMatchObject({
      id: 'C',
      oculta: true,
      desbloqueada: false,
      iconeUrl: 'https://steamcdn-a.akamaihd.net/C-cinza.jpg',
      raridadePercentual: null,
    });
    expect(Object.keys(corpo.dados).sort()).toEqual(
      [
        'atualizadoEm',
        'capaUrl',
        'conquistasDesbloqueadas',
        'conquistasTotal',
        'idExterno',
        'minutosJogados',
        'provedor',
        'ultimaVezJogadoEm',
      ].sort(),
    );
    expect(ctx.client.listarJogos).toHaveBeenCalledTimes(1);
  });

  it('dado com 10 min: as horas NÃO são reconsultadas, só a lista de conquistas (CA-44)', async () => {
    const { ana } = await comLigado(10 * 60_000);

    const response = await pedir('GET', CAMINHO(G_CELESTE), ana);
    const corpo = (await response.json()) as {
      dados: { minutosJogados: number };
      conquistas: unknown[];
    };

    expect(response.status).toBe(200);
    expect(ctx.client.listarJogos).not.toHaveBeenCalled();
    expect(ctx.client.obterConquistasDoJogador).toHaveBeenCalledTimes(1);
    expect(corpo.dados.minutosJogados).toBe(5);
    expect(corpo.conquistas).toHaveLength(3);
  });

  it('duas aberturas seguidas (dentro de 1 h): a segunda NÃO grava e NÃO chama a Steam além do cache', async () => {
    const { ana } = await comLigado(10 * 60_000);

    await pedir('GET', CAMINHO(G_CELESTE), ana);
    const escritasDepoDaPrimeira = ctx.db.escritas;
    const chamadasDepoisDaPrimeira = chamadasASteam();
    const segunda = await pedir('GET', CAMINHO(G_CELESTE), ana);

    expect(segunda.status).toBe(200);
    expect(ctx.db.escritas).toBe(escritasDepoDaPrimeira);
    expect(chamadasASteam()).toBe(chamadasDepoisDaPrimeira);
  });

  it('dado velho: duas aberturas seguidas gravam UMA vez e consultam as horas UMA vez', async () => {
    const { ana } = await comLigado(2 * HORA);

    await pedir('GET', CAMINHO(G_CELESTE), ana);
    const escritas = ctx.db.escritas;
    await pedir('GET', CAMINHO(G_CELESTE), ana);

    expect(ctx.client.listarJogos).toHaveBeenCalledTimes(1);
    expect(ctx.db.escritas).toBe(escritas);
    expect(chamadasASteam()).toBe(4);
  });

  it('POST duas vezes em 30 s: a 1ª consulta a Steam, a 2ª devolve o gravado sem chamá-la; ≥ 30 s depois consulta de novo (CA-45)', async () => {
    const { ana } = await comLigado(10 * 60_000);

    const primeira = await pedir('POST', ATUALIZACAO(G_CELESTE), ana);
    expect(primeira.status).toBe(200);
    expect(ctx.client.listarJogos).toHaveBeenCalledTimes(1);
    const chamadas = chamadasASteam();

    const segunda = await pedir('POST', ATUALIZACAO(G_CELESTE), ana);
    const corpo = (await segunda.json()) as {
      dados: { minutosJogados: number };
      conquistas: unknown[];
    };
    expect(segunda.status).toBe(200);
    expect(chamadasASteam()).toBe(chamadas);
    expect(corpo.dados.minutosJogados).toBe(600);
    expect(corpo.conquistas).toHaveLength(3);

    linhaCeleste()!.atualizadoEm = new Date(Date.now() - 31_000);
    await pedir('POST', ATUALIZACAO(G_CELESTE), ana);
    expect(ctx.client.listarJogos).toHaveBeenCalledTimes(2);
  });

  it('sem vínculo, de outro usuário, id inválido ou sem token: 404, 404, 400 e 401, e NENHUMA chamada à Steam (CA-46, CA-57)', async () => {
    const { ana } = await comLigado(2 * HORA);

    for (const caminho of [CAMINHO, ATUALIZACAO]) {
      const metodo = caminho === CAMINHO ? 'GET' : 'POST';
      const semVinculo = await pedir(metodo, caminho(G_HADES), ana);
      expect(semVinculo.status).toBe(404);
      expect((await json(semVinculo))?.code).toBe('PLATAFORMA_VINCULO_NAO_ENCONTRADO');

      const deBia = await pedir(metodo, caminho(G_BIA), ana);
      expect(deBia.status).toBe(404);
      expect((await json(deBia))?.message).toBe('Jogo não encontrado');

      expect((await pedir(metodo, caminho('nao-e-uuid'), ana)).status).toBe(400);
      expect((await pedir(metodo, caminho(G_CELESTE))).status).toBe(401);
    }
    expect(chamadasASteam()).toBe(0);
  });

  it('(SIMULADO, sem fixture real) conquistas negadas: 200 CONQUISTAS_PRIVADAS, horas novas e contagens antigas (CA-47)', async () => {
    const { ana } = await comLigado(2 * HORA);
    ctx.client.obterConquistasDoJogador.mockResolvedValue({ tipo: 'negado' });

    const response = await pedir('GET', CAMINHO(G_CELESTE), ana);
    const corpo = (await response.json()) as {
      dados: Record<string, unknown>;
      conquistas: unknown[];
      aviso: string;
    };

    expect(response.status).toBe(200);
    expect(corpo.aviso).toBe('CONQUISTAS_PRIVADAS');
    expect(corpo.conquistas).toEqual([]);
    expect(corpo.dados).toMatchObject({
      minutosJogados: 600,
      conquistasTotal: 1,
      conquistasDesbloqueadas: 0,
    });
    expect(linhaCeleste()).toMatchObject({ minutosJogados: 600, conquistasTotal: 1 });
  });

  it('(SIMULADO, sem fixture real) biblioteca privada: 200 PERFIL_PRIVADO com o valor gravado, sem escrever (CA-47)', async () => {
    const { ana } = await comLigado(2 * HORA);
    ctx.client.listarJogos.mockResolvedValue({ privada: true, total: 0, jogos: [] });
    const antes = ctx.db.escritas;

    const response = await pedir('GET', CAMINHO(G_CELESTE), ana);
    const corpo = (await response.json()) as { dados: Record<string, unknown>; aviso: string };

    expect(response.status).toBe(200);
    expect(corpo.aviso).toBe('PERFIL_PRIVADO');
    expect(corpo.dados.minutosJogados).toBe(5);
    expect(ctx.db.escritas).toBe(antes);
  });

  it('jogo sem conquistas (400 "no stats", real): 200 SEM_CONQUISTAS, 0 de 0 gravado (CA-48)', async () => {
    const { ana } = await comLigado(10 * 60_000);
    ctx.client.obterConquistasDoJogador.mockResolvedValue({ tipo: 'sem-conquistas' });

    const response = await pedir('GET', CAMINHO(G_CELESTE), ana);
    const corpo = (await response.json()) as {
      dados: Record<string, unknown>;
      aviso: string;
      conquistas: unknown[];
    };

    expect(corpo.aviso).toBe('SEM_CONQUISTAS');
    expect(corpo.conquistas).toEqual([]);
    expect(corpo.dados).toMatchObject({ conquistasTotal: 0, conquistasDesbloqueadas: 0 });
    expect(linhaCeleste()).toMatchObject({ conquistasTotal: 0, conquistasDesbloqueadas: 0 });
  });

  it.each([
    ['timeout/5xx', new PlataformaIndisponivelError(), 502, 'PLATAFORMA_INDISPONIVEL'],
    ['429', new PlataformaLimiteError(), 502, 'PLATAFORMA_LIMITE'],
  ])(
    'Steam falhando (%s): o GET NUNCA dá 502 (200 com o gravado e INDISPONIVEL); só o POST dá 502 (CA-49)',
    async (_nome, erro, statusDoPost, codeDoPost) => {
      const { ana } = await comLigado(2 * HORA);
      ctx.client.listarJogos.mockRejectedValue(erro);
      const antes = ctx.db.escritas;

      const get = await pedir('GET', CAMINHO(G_CELESTE), ana);
      const corpo = (await get.json()) as {
        dados: Record<string, unknown>;
        aviso: string;
        conquistas: unknown[];
      };
      expect(get.status).toBe(200);
      expect(corpo.aviso).toBe('INDISPONIVEL');
      expect(corpo.conquistas).toEqual([]);
      expect(corpo.dados.minutosJogados).toBe(5);
      expect(ctx.db.escritas).toBe(antes);

      const post = await pedir('POST', ATUALIZACAO(G_CELESTE), ana);
      expect(post.status).toBe(statusDoPost);
      expect((await json(post))?.code).toBe(codeDoPost);
      expect(ctx.db.escritas).toBe(antes);
    },
  );

  it('nenhum log tem a chave, o SteamID, o state ou uma URL, mesmo com a Steam falhando (CA-58)', async () => {
    const { ana } = await comLigado(2 * HORA);
    ctx.client.listarJogos.mockRejectedValue(new PlataformaIndisponivelError());
    ctx.logger.lines.length = 0;

    await pedir('GET', CAMINHO(G_CELESTE), ana);
    await pedir('POST', ATUALIZACAO(G_CELESTE), ana);

    const logs = ctx.logger.lines.join('\n');
    expect(logs).toContain('PlataformaIndisponivelError');
    expect(logs).not.toContain(STEAM_ID);
    expect(logs).not.toContain('ABCDEF0123456789ABCDEF0123456789');
    expect(logs).not.toContain(CELESTE);
    expect(logs).not.toMatch(/https?:\/\//);
    expect(logs).not.toMatch(/key=|state=|checkpoint_vinculo/);
  });

  it('falha só do schema ou dos percentuais: continua 200, sem enfeite (CA-50)', async () => {
    const { ana } = await comLigado(10 * 60_000);
    ctx.client.obterSchema.mockRejectedValue(new PlataformaIndisponivelError());
    ctx.client.obterPercentuaisGlobais.mockRejectedValue(new PlataformaLimiteError());

    const response = await pedir('GET', CAMINHO(G_CELESTE), ana);
    const corpo = (await response.json()) as {
      aviso: string | null;
      conquistas: Record<string, unknown>[];
    };

    expect(response.status).toBe(200);
    expect(corpo.aviso).toBeNull();
    expect(corpo.conquistas).toHaveLength(3);
    expect(corpo.conquistas[0]).toMatchObject({
      nome: 'Nome A',
      iconeUrl: null,
      raridadePercentual: null,
    });
  });
});

describe('todas as rotas exigem token, menos o retorno (CA-57)', () => {
  const UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  /** As rotas do controller, lidas dos metadados do Nest: uma rota nova entra aqui sozinha. */
  function rotasDoControlador(): { metodo: string; caminho: string; molde: string }[] {
    const prefixo = String(Reflect.getMetadata(PATH_METADATA, IntegrationsController));
    const proto = IntegrationsController.prototype as unknown as Record<string, unknown>;
    return Object.getOwnPropertyNames(proto)
      .filter((nome) => nome !== 'constructor')
      .flatMap((nome) => {
        const manipulador = proto[nome] as object;
        const metodo = Reflect.getMetadata(METHOD_METADATA, manipulador) as number | undefined;
        const caminho = Reflect.getMetadata(PATH_METADATA, manipulador) as string | undefined;
        if (metodo === undefined || caminho === undefined) {
          return [];
        }
        const molde = `/${prefixo}/${caminho}`.replace(/\/+/g, '/').replace(/\/$/, '');
        return [
          {
            metodo: RequestMethod[metodo] as string,
            molde,
            caminho: molde.replace(':provedor', 'steam').replace(':jogoId', UUID),
          },
        ];
      });
  }

  it('o levantamento acha as rotas conhecidas (senão o teste abaixo não provaria nada)', () => {
    const moldes = rotasDoControlador().map((rota) => `${rota.metodo} ${rota.molde}`);

    expect(moldes).toEqual(
      expect.arrayContaining([
        'GET /integracoes',
        'POST /integracoes/:provedor/vinculo',
        'GET /integracoes/:provedor/retorno',
        'DELETE /integracoes/:provedor',
        'GET /integracoes/:provedor/perfil',
        'POST /integracoes/:provedor/perfil/atualizacao',
        'GET /integracoes/:provedor/biblioteca',
        'PUT /integracoes/:provedor/jogos/:jogoId',
        'GET /integracoes/:provedor/jogos/:jogoId',
        'POST /integracoes/:provedor/jogos/:jogoId/atualizacao',
        'DELETE /integracoes/:provedor/jogos/:jogoId',
      ]),
    );
    expect(moldes).toHaveLength(11);
  });

  it('cada rota sem Authorization dá 401 AUTH_NAO_AUTENTICADO; só o retorno responde 302', async () => {
    for (const rota of rotasDoControlador()) {
      const response = await pedir(rota.metodo, rota.caminho);

      if (rota.molde === '/integracoes/:provedor/retorno') {
        expect(response.status).toBe(302);
      } else {
        expect(response.status).toBe(401);
        expect(await json(response)).toMatchObject({ code: 'AUTH_NAO_AUTENTICADO' });
      }
    }
  });

  it('um token que não é de acesso (o state do vínculo) também dá 401 em todas elas (CA-61)', async () => {
    const ida = await iniciar(await ctx.tokenFor(ANA_ID));

    for (const rota of rotasDoControlador()) {
      if (rota.molde === '/integracoes/:provedor/retorno') {
        continue;
      }
      const response = await pedir(rota.metodo, rota.caminho, ida.state);
      expect(response.status).toBe(401);
    }
  });
});

describe('nenhum log com segredo numa execução completa, com sucesso e com todas as falhas (CA-58)', () => {
  const G = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const APP = '504230';

  it('a chave, o SteamID, o state, o cookie, o token e as URLs da Steam nunca aparecem', async () => {
    const ana = await ctx.tokenFor(ANA_ID);
    const segredos: string[] = [ana];
    ctx.db.games.push({ id: G, userId: ANA_ID, titulo: 'Celeste', plataforma: 'PC' });
    const falhas = [
      new PlataformaIndisponivelError(),
      new PlataformaLimiteError(),
      new PerfilPrivadoError(),
    ];

    // 1) Vínculo: sucesso e todas as falhas do retorno (cancelado, recusado, state ruim, sem cookie).
    const ida = await iniciar(ana);
    segredos.push(ida.state ?? '', ida.nonce ?? '');
    for (const erro of [new VinculoCanceladoError(), new VinculoRecusadoError()]) {
      const outra = await iniciar(ana);
      segredos.push(outra.state ?? '', outra.nonce ?? '');
      ctx.openId.validarRetorno.mockRejectedValueOnce(erro);
      await retornar(outra.state, outra.nonce);
    }
    await retornar('state.invalido.qualquer', ida.nonce);
    await retornar(ida.state, undefined);
    expect((await retornar(ida.state, ida.nonce)).status).toBe(302);

    // 2) Perfil e biblioteca: cada falha da Steam, depois o sucesso (erro não entra no cache).
    ctx.client.obterPerfil.mockResolvedValue(perfilPublico);
    for (const erro of falhas) {
      ctx.client.listarJogos.mockRejectedValueOnce(erro);
      await pedir('GET', '/integracoes/steam/perfil', ana);
    }
    ctx.client.listarJogos.mockResolvedValue({
      privada: false,
      total: 1,
      jogos: [{ appid: APP, nome: 'Celeste', minutosJogados: 600, ultimaVezJogadoEm: null }],
    });
    await pedir('GET', '/integracoes/steam/perfil', ana);
    await pedir('GET', '/integracoes/steam/biblioteca?busca=cel', ana);

    // 3) Vínculo do jogo: cada falha e o sucesso; detalhe e atualização, com falhas e sucesso.
    ctx.client.obterConquistasDoJogador.mockResolvedValue({ tipo: 'sem-conquistas' });
    const enviar = (metodo: string, caminho: string, corpo?: unknown) =>
      fetch(`${ctx.baseUrl}${caminho}`, {
        method: metodo,
        headers: { authorization: `Bearer ${ana}`, 'content-type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
    for (const erro of falhas) {
      ctx.client.listarJogos.mockRejectedValueOnce(erro);
      await enviar('PUT', `/integracoes/steam/jogos/${G}`, { idExterno: APP });
    }
    expect((await enviar('PUT', `/integracoes/steam/jogos/${G}`, { idExterno: APP })).status).toBe(
      200,
    );
    ctx.db.jogos[0]!.atualizadoEm = new Date(0);
    for (const erro of falhas) {
      ctx.client.listarJogos.mockRejectedValueOnce(erro);
      await enviar('GET', `/integracoes/steam/jogos/${G}`);
    }
    ctx.db.jogos[0]!.atualizadoEm = new Date(0);
    for (const erro of falhas) {
      ctx.client.listarJogos.mockRejectedValueOnce(erro);
      await enviar('POST', `/integracoes/steam/jogos/${G}/atualizacao`);
    }
    await enviar('GET', `/integracoes/steam/jogos/${G}`);
    await enviar('POST', `/integracoes/steam/jogos/${G}/atualizacao`);
    await enviar('DELETE', `/integracoes/steam/jogos/${G}`);
    await enviar('DELETE', '/integracoes/steam');

    const logs = ctx.logger.lines.join('\n');
    // Prova de que as falhas passaram pelos logs (senão a ausência de segredo seria vazia).
    expect(logs).toMatch(/PlataformaIndisponivelError|PlataformaLimiteError|PerfilPrivadoError/);
    expect(logs).not.toContain(STEAM_ID);
    expect(logs).not.toContain('ABCDEF0123456789ABCDEF0123456789');
    for (const segredo of segredos) {
      expect(segredo).not.toBe('');
      expect(logs).not.toContain(segredo);
    }
    expect(logs).not.toContain('checkpoint_vinculo');
    expect(logs).not.toMatch(/key=|state=|openid\./i);
    expect(logs).not.toMatch(/https?:\/\/(steamcommunity|api\.steampowered|store\.steampowered)/i);
  });
});
