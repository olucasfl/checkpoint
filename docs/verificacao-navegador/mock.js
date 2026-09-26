// Harness: API 100% mockada no navegador (nada sai para o Supabase, bucket nem as portas 3333/5173).
const BASE = 'http://localhost:5199';
const APIO = 'http://localhost:5198'; // API em OUTRA origem, como o seu dev (web 5173 -> api 3333)
const USER = { id: 'u1', nome: 'Pessoa Teste', email: 'usuario@exemplo.com', criadoEm: '2026-01-01T00:00:00.000Z' };

const svg = (w, h, cor, txt) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${cor}"/><text x="50%" y="50%" font-size="${Math.round(h / 8)}" text-anchor="middle" fill="white">${txt}</text></svg>`;

const t0 = Date.parse('2026-09-25T12:00:00Z');
let n = 0;
const g = (titulo, status, extra = {}) => ({
  id: `g${++n}`, titulo, plataforma: 'PC', status,
  notas: { gameplay: null, historia: null, graficos: null, trilhaSonora: null, performance: null },
  notaMedia: null, descricao: null, capaUrl: null,
  criadoEm: '2026-09-01T12:00:00.000Z', atualizadoEm: new Date(t0 - n * 3600e3).toISOString(),
  dadosPlataforma: [], ...extra,
});
const steam = (min, total, ganhas, capa = null) => ({
  provedor: 'STEAM', idExterno: '504230', minutosJogados: min, ultimaVezJogadoEm: '2026-09-23T12:00:00.000Z',
  conquistasTotal: total, conquistasDesbloqueadas: ganhas, capaUrl: capa,
  atualizadoEm: new Date(Date.now() - 12 * 60000).toISOString(),
});
const notas = (a, b, c, d, e) => ({ gameplay: a, historia: b, graficos: c, trilhaSonora: d, performance: e });

function jogos() {
  n = 0;
  return [
    g('Hollow Knight', 'JOGANDO', {
      notaMedia: 8.3, notas: notas(9, 8, 8.5, 9.5, 6.5), capaUrl: 'https://img.test/quadrada.svg',
      descricao: 'Explorei quase tudo em Hallownest.\nFalta o Caminho da Dor e o último chefe opcional. <b>texto</b> literal.',
      dadosPlataforma: [steam(2550, 40, 12)],
    }),
    g('A'.repeat(120), 'JOGANDO', { notaMedia: 10, notas: notas(10, null, null, null, null), plataforma: 'Xbox Series X|S' }),
    g('Capa larga enviada', 'JOGANDO', { plataforma: null, capaUrl: 'https://img.test/larga.svg' }),
    g('Sem vínculo e sem média', 'QUERO_JOGAR', { plataforma: 'PlayStation 5' }),
    g('Zerado com Steam', 'ZERADO', { notaMedia: 9.1, notas: notas(9.1, null, null, null, null), dadosPlataforma: [steam(600, 20, 20, 'https://img.test/oficial.svg')] }),
    ...Array.from({ length: 10 }, (_, i) => g(`Jogo de teste ${i + 6}`, 'JOGANDO', { notaMedia: i % 2 ? 7.5 : null })),
  ];
}


/** Dados de produção "feios": o que um catálogo real acumula e o mock feliz nunca tinha. */
function jogosFeios() {
  n = 0;
  const longa = Array.from({ length: 40 }, (_, i) => `Linha ${i + 1} da descrição, com <b>HTML</b> & "aspas" e acentuação: ção, ñ, 日本語.`).join('\n').slice(0, 1000);
  const base = [
    g('<script>alert(1)</script> & "aspas" 🎮 título esquisito', 'JOGANDO', { plataforma: 'Steam Deck', descricao: longa, capaUrl: 'https://img.test/404.png', notaMedia: 0, notas: notas(0, 0, 0, 0, 0) }),
    g('Zero conquistas', 'JOGANDO', { dadosPlataforma: [{ ...steam(123456, 0, 0), ultimaVezJogadoEm: null, capaUrl: null }] }),
    g('Conquistas nulas', 'ZERADO', { notaMedia: 7.7, notas: notas(7.7, null, null, null, null), dadosPlataforma: [{ ...steam(45, null, null), ultimaVezJogadoEm: null }] }),
    g('Mesmo título', 'QUERO_JOGAR', { plataforma: 'PC' }),
    g('Mesmo título', 'QUERO_JOGAR', { plataforma: 'Nintendo Switch' }),
    g('Plataforma antiga', 'ZERADO', { plataforma: 'Atari 2600', notaMedia: 3.2, notas: notas(3.2, null, null, null, null) }),
    g('a', 'JOGANDO', { plataforma: null }),
    g('Descrição só com quebras', 'JOGANDO', { descricao: '\n\n\n' }),
  ];
  const volume = Array.from({ length: 52 }, (_, i) => g(`Volume ${String(i).padStart(2, '0')}`, ['JOGANDO', 'QUERO_JOGAR', 'ZERADO'][i % 3], { notaMedia: (i % 11) + 0.5 > 10 ? 10 : (i % 11) + 0.5, notas: notas((i % 11) + 0.5 > 10 ? 10 : (i % 11) + 0.5, null, null, null, null), plataforma: [null, 'PC', 'PlayStation 5', 'Xbox Series X|S', 'Nintendo Switch'][i % 5] }));
  return [...base, ...volume];
}

const conquistas = () => [
  { id: 'a1', nome: 'Conquista desbloqueada A', descricao: 'Descrição da conquista, como a Steam entrega.', oculta: false, desbloqueada: true, desbloqueadaEm: '2026-09-20T12:00:00.000Z', iconeUrl: 'https://img.test/icone.svg', raridadePercentual: 62.1 },
  { id: 'a2', nome: 'B com um nome de conquista bem comprido que precisa quebrar em duas linhas', descricao: 'Outra descrição vinda da Steam, também longa o bastante para quebrar.', oculta: false, desbloqueada: true, desbloqueadaEm: '2026-09-18T12:00:00.000Z', iconeUrl: null, raridadePercentual: 40.7 },
  { id: 'f1', nome: 'Faltando C', descricao: 'Ainda não desbloqueada.', oculta: false, desbloqueada: false, desbloqueadaEm: null, iconeUrl: 'https://img.test/icone.svg', raridadePercentual: 12.4 },
  { id: 'f2', nome: 'Segredo', descricao: null, oculta: true, desbloqueada: false, desbloqueadaEm: null, iconeUrl: null, raridadePercentual: null },
  { id: 'f3', nome: 'Faltando E', descricao: 'Mais uma.', oculta: false, desbloqueada: false, desbloqueadaEm: null, iconeUrl: null, raridadePercentual: 3.2 },
];

const biblioteca = () => [
  { idExterno: '100', titulo: 'Jogo Sintetico da Biblioteca', capaUrl: 'https://img.test/oficial.svg', minutosJogados: 90, ultimaVezJogadoEm: null, jogosParecidos: [], vinculadoA: null },
  { idExterno: '101', titulo: 'Outro item da biblioteca com nome comprido demais para caber numa linha só', capaUrl: null, minutosJogados: 0, ultimaVezJogadoEm: null, jogosParecidos: [{ id: 'g4', titulo: 'Sem vínculo e sem média' }], vinculadoA: null },
];

/** opts: { unauth, games, contas, gamesDelay, gamesError, health } */
let window_calls = [];
async function instalar(page, opts = {}) {
  const dados = opts.games ?? jogos();
  const contas = opts.contas ?? [{ provedor: 'STEAM', idExterno: 'STEAMID_SINTETICO', nomeExibicao: 'Jogador Sintetico', vinculadaEm: '2026-09-25T12:00:00.000Z' }];
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === 'img.test') {
      const f = u.pathname;
      const body = f.includes('quadrada') ? svg(400, 400, '#2b7a4b', 'quadrada') : f.includes('larga') ? svg(800, 450, '#7a2b5a', 'larga') : f.includes('icone') ? svg(64, 64, '#a07a2b', 'ic') : svg(600, 900, '#2b4b7a', 'oficial');
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body });
    }
    if (u.origin === APIO && u.pathname.startsWith('/api/')) {
      const p = u.pathname.replace(/^\/api/, '');
      const m = route.request().method();
      const req = route.request().headers();
      const cors = { 'access-control-allow-origin': BASE, 'access-control-allow-credentials': 'true', vary: 'Origin' };
      if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET,HEAD,PUT,PATCH,POST,DELETE', 'access-control-allow-headers': req['access-control-request-headers'] || '' } });
      const json = (b, s = 200) => route.fulfill({ status: s, headers: cors, contentType: 'application/json', body: JSON.stringify(b) });
      window_calls.push(`${m} ${p}`);
      if (opts.override) { const o = opts.override(p, m, route.request().postData()); if (o) { window_calls.push(`${m} ${p} -> ${o.status} (injetado)`); return o.status === 204 ? route.fulfill({ status: 204, headers: cors }) : json(o.body, o.status); } }
      if (p === '/auth/refresh') return opts.unauth ? json({ code: 'AUTH_REFRESH_INVALIDO', message: 'x' }, 401) : json({ accessToken: 'mock', usuario: USER });
      if (p === '/auth/login' || p === '/auth/registro') return json({ accessToken: 'mock', usuario: USER });
      if (p === '/auth/me') return json(USER);
      if (p === '/auth/sessoes') return json([{ id: 's1', dispositivo: 'Chrome · Windows', criadoEm: '2026-09-20T12:00:00.000Z', ultimoUsoEm: '2026-09-25T11:00:00.000Z', atual: true }, { id: 's2', dispositivo: 'Safari · iPhone', criadoEm: '2026-09-10T12:00:00.000Z', ultimoUsoEm: '2026-09-24T11:00:00.000Z', atual: false }]);
      if (p === '/health') return opts.health === 'erro' ? json({ message: 'x' }, 503) : json({ status: 'ok', timestamp: '2026-09-25T12:00:00.000Z', database: 'up' });
      if (p === '/games' && m === 'GET') {
        if (opts.gamesDelay) await new Promise((r) => setTimeout(r, opts.gamesDelay));
        return opts.gamesError ? json({ message: 'x' }, 500) : json(dados);
      }
      if (p === '/games' && m === 'POST') return json({ ...dados[0], id: 'novo' }, 201);
      if (/^\/games\/[^/]+$/.test(p) && m === 'PATCH') return json(dados.find((x) => x.id === p.split('/').pop()) ?? dados[0]);
      if (/^\/games\/[^/]+$/.test(p) && m === 'DELETE') return route.fulfill({ status: 204, headers: cors });
      if (p === '/auth/logout') return route.fulfill({ status: 204, headers: cors });
      if (p === '/auth/senha' && m === 'PUT') return route.fulfill({ status: 204, headers: cors });
      if (p === '/users/me' && m === 'PATCH') return json({ ...USER, nome: 'Nome Novo' });
      if (p === '/users/me/exclusao') return route.fulfill({ status: 204, headers: cors });
      if (p === '/auth/sessoes' && m === 'DELETE') return json({ encerradas: 1 });
      if (/^\/auth\/sessoes\//.test(p) && m === 'DELETE') return route.fulfill({ status: 204, headers: cors });
      if (p === '/integracoes/steam/vinculo') return json({ url: 'https://steamcommunity.com/openid/login?x=1' });
      if (p === '/integracoes/steam' && m === 'DELETE') return route.fulfill({ status: 204, headers: cors });
      if (/^\/integracoes\/steam\/jogos\/[^/]+$/.test(p) && m === 'PUT') return json(steam(90, null, null));
      if (/^\/integracoes\/steam\/jogos\/[^/]+$/.test(p) && m === 'DELETE') return route.fulfill({ status: 204, headers: cors });
      if (/^\/integracoes\/steam\/jogos\/[^/]+\/atualizacao$/.test(p) && m === 'POST') return json({ dados: steam(3000, 40, 15), conquistas: conquistas(), aviso: null });
      if (/^\/games\/[^/]+\/capa$/.test(p)) return json(dados[0]);
      if (p === '/integracoes') return json(contas);
      if (p === '/integracoes/steam/perfil' || p === '/integracoes/steam/perfil/atualizacao')
        return json({ provedor: 'STEAM', nomeExibicao: 'Jogador Sintetico', avatarUrl: null, perfilUrl: 'https://steamcommunity.com/id/x', totalJogos: 132, minutosTotais: 61234, maisJogados: [{ idExterno: '1', titulo: 'Hollow Knight', capaUrl: null, minutosJogados: 2550 }], conquistas: { desbloqueadas: 210, total: 640, jogosVinculados: 5 }, consultadoEm: new Date().toISOString() });
      if (p === '/integracoes/steam/biblioteca') return json(biblioteca());
      if (/^\/integracoes\/steam\/jogos\//.test(p) && m === 'GET') {
        const id = decodeURIComponent(p.split('/').pop());
        const jg = dados.find((x) => x.id === id);
        const d = jg?.dadosPlataforma[0] ?? steam(0, 0, 0);
        return json({ dados: d, conquistas: conquistas(), aviso: null });
      }
      return json({ message: 'mock: ' + m + ' ' + p }, 404);
    }
    return route.continue();
  });
}

async function abrir(browser, opts, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (mm) => { if (['error', 'warning'].includes(mm.type())) erros.push(mm.type() + ': ' + mm.text().slice(0, 300)); });
  page.on('requestfailed', (rq) => erros.push('requestfailed: ' + rq.method() + ' ' + rq.url().slice(0, 120) + ' ' + (rq.failure() || {}).errorText));
  page.on('response', (rs) => { if (rs.status() >= 400) erros.push('http ' + rs.status() + ' ' + rs.request().method() + ' ' + rs.url().slice(0, 120)); });
  await instalar(page, opts);
  return { ctx, page, erros };
}

async function pronto(page, sel) {
  await page.waitForSelector(sel, { timeout: 8000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

module.exports = { BASE, APIO, abrir, pronto, jogos, jogosFeios, instalar, calls: () => window_calls };
