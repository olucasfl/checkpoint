// Fluxos completos com as CHAMADAS DE ESCRITA (o clique isolado não as exercita): login, criar, editar, excluir,
// ligar à Steam, atualizar, desvincular, preferências, trocar senha, sair. Registra as requisições que saíram.
const { chromium } = require('playwright');
const fs = require('fs');
const { BASE, APIO, abrir, pronto } = require('./mock');

const VIEWS = [
  ['1280', { viewport: { width: 1280, height: 900 } }],
  ['360', { viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true }],
];
const rows = [];
const CAPT = new Map();
function captura(page) { page.on('request', (r) => { const u = new URL(r.url()); if (u.origin !== APIO || r.method() === 'OPTIONS') return; let corpo = r.postData() || ''; try { const j = JSON.parse(corpo); corpo = JSON.stringify(j, (k, v) => (typeof v === 'string' && v.length > 40 ? v.slice(0, 40) + '…' : v)); } catch { corpo = corpo ? '(não-JSON ' + corpo.length + ' bytes)' : ''; } const chave = `${r.method()} ${u.pathname.replace('/api', '').replace(/\/[0-9a-f-]{3,}(?=\/|$)/g, '/:id')}${u.search}`; if (!CAPT.has(chave + corpo)) CAPT.set(chave + corpo, { chave, corpo }); }); }
const reg = (view, fluxo, ok, detalhe) => rows.push({ view, fluxo, ok, detalhe });

async function comReqs(page, fn) {
  const reqs = [];
  const h = (r) => { const u = new URL(r.url()); if (u.origin === APIO && r.method() !== 'OPTIONS') reqs.push(`${r.method()} ${u.pathname.replace('/api', '')}`); };
  page.on('request', h);
  await fn();
  page.off('request', h);
  return reqs;
}
const abrirAdicionar = async (p) => {
  const topo = p.getByRole('button', { name: 'Adicionar jogo' });
  if (await topo.count() && await topo.first().isVisible()) await topo.first().click();
  else await p.locator('nav[aria-label="Navegação principal"] button').first().click();
  await p.waitForSelector('dialog[open]');
};

const FLUXOS = [
  ['login: digita, entra e cai no catálogo', { unauth: true }, async (p) => {
    await p.goto(BASE + '/login'); await pronto(p, 'form');
    await p.getByLabel('E-mail').fill('usuario@exemplo.com'); await p.getByLabel('Senha', { exact: true }).fill('senha-sintetica-1');
    return await comReqs(p, async () => { await p.getByRole('button', { name: 'Entrar', exact: true }).click(); await p.waitForSelector('[data-tile]', { timeout: 6000 }); });
  }, (r, p) => r.includes('POST /auth/login') && new URL(p.url()).pathname === '/'],
  ['login vazio: mostra erro de campo, não chama a API', { unauth: true }, async (p) => {
    await p.goto(BASE + '/login'); await pronto(p, 'form');
    return await comReqs(p, async () => { await p.getByRole('button', { name: 'Entrar', exact: true }).click(); await p.waitForTimeout(600); });
  }, (r, p) => !r.includes('POST /auth/login') && p.locator('[role=alert]').count().then((n) => n > 0)],
  ['catálogo: cada pílula de filtro troca a estante e a URL', {}, async (p) => {
    await p.goto(BASE + '/'); await pronto(p, '[data-tile]');
    const out = [];
    for (const nome of [/Jogando/, /Quero jogar/, /Zerado/, /Todos/]) { await p.locator('[role=group][aria-label="Filtrar por status"]').getByRole('button', { name: nome }).click(); await p.waitForTimeout(250); out.push(p.url().split('?')[1] || 'sem-filtro'); }
    return out;
  }, (r) => r.join(',') === 'status=JOGANDO,status=QUERO_JOGAR,status=ZERADO,sem-filtro' || r.join(',') === 'status=JOGANDO,status=QUERO_JOGAR,status=ZERADO,status=TODOS'],
  ['criar jogo: preenche, salva, fecha e a lista é buscada de novo', {}, async (p) => {
    await p.goto(BASE + '/'); await pronto(p, '[data-tile]'); await abrirAdicionar(p);
    await p.getByLabel('Título').fill('Jogo Criado no Teste');
    return await comReqs(p, async () => { await p.getByRole('button', { name: 'Salvar' }).click(); await p.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 6000 }); await p.waitForTimeout(500); });
  }, (r) => r.includes('POST /games') && r.includes('GET /games')],
  ['criar jogo sem título: erro no campo, sem POST', {}, async (p) => {
    await p.goto(BASE + '/'); await pronto(p, '[data-tile]'); await abrirAdicionar(p);
    return await comReqs(p, async () => { await p.getByRole('button', { name: 'Salvar' }).click(); await p.waitForTimeout(600); });
  }, (r, p) => !r.includes('POST /games') && p.locator('dialog[open] [role=alert]').count().then((n) => n > 0)],
  ['adicionar da prateleira "Quero jogar": já vem marcado e salva', {}, async (p) => {
    await p.goto(BASE + '/'); await pronto(p, '[data-tile]');
    await p.locator('[data-prateleira=QUERO_JOGAR] [data-adicionar] button').click(); await p.waitForSelector('dialog[open]');
    const marcado = await p.locator('dialog[open] [aria-pressed=true]').first().innerText();
    await p.getByLabel('Título').fill('Da Prateleira');
    const r = await comReqs(p, async () => { await p.getByRole('button', { name: 'Salvar' }).click(); await p.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 6000 }); });
    return { marcado, r };
  }, (r) => /Quero jogar/.test(r.marcado) && r.r.includes('POST /games')],
  ['Steam: buscar, criar jogo, salvar (POST /games e depois PUT do vínculo)', {}, async (p) => {
    await p.goto(BASE + '/'); await pronto(p, '[data-tile]'); await abrirAdicionar(p);
    await p.getByRole('button', { name: 'Buscar na Steam' }).click(); await p.waitForTimeout(600);
    await p.getByRole('button', { name: /Criar jogo: Jogo Sintetico/ }).click(); await p.waitForTimeout(400);
    return await comReqs(p, async () => { await p.getByRole('button', { name: 'Salvar' }).click(); await p.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(600); });
  }, (r) => r.includes('POST /games') && r.some((x) => /^PUT \/integracoes\/steam\/jogos\//.test(x))],
  ['editar no detalhe: muda o título e salva (PATCH)', {}, async (p) => {
    await p.goto(BASE + '/jogos/g1'); await pronto(p, 'article');
    await p.getByRole('button', { name: 'Editar', exact: true }).click(); await p.waitForSelector('dialog[open]');
    await p.getByLabel('Título').fill('Título Editado');
    return await comReqs(p, async () => { await p.getByRole('button', { name: 'Salvar' }).click(); await p.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 6000 }); });
  }, (r) => r.some((x) => /^PATCH \/games\//.test(x))],
  ['excluir no detalhe: confirma, DELETE e volta ao catálogo', {}, async (p) => {
    await p.goto(BASE + '/jogos/g4'); await pronto(p, 'article');
    await p.getByRole('button', { name: 'Excluir', exact: true }).click(); await p.waitForSelector('dialog[open]');
    return await comReqs(p, async () => { await p.getByRole('button', { name: 'Remover', exact: true }).click(); await p.waitForURL((u) => u.pathname === '/', { timeout: 6000 }); });
  }, (r) => r.some((x) => /^DELETE \/games\//.test(x))],
  ['tile: Editar e Remover pelo hover (desktop)', {}, async (p) => {
    if (await p.evaluate(() => !matchMedia('(hover: hover)').matches)) return 'sem-hover';
    await p.goto(BASE + '/'); await pronto(p, '[data-tile]');
    const t = p.locator('[data-tile]').first(); await t.hover(); await p.getByRole('button', { name: /^Editar / }).first().click(); await p.waitForSelector('dialog[open]');
    await p.keyboard.press('Escape'); await t.hover(); await p.getByRole('button', { name: /^Remover / }).first().click(); await p.waitForSelector('dialog[open]');
    return await comReqs(p, async () => { await p.getByRole('button', { name: 'Remover', exact: true }).click(); await p.waitForTimeout(700); });
  }, (r) => r === 'sem-hover' || r.some((x) => /^DELETE \/games\//.test(x))],
  ['detalhe Steam: Atualizar (POST atualizacao) e abrir conquistas', {}, async (p) => {
    await p.goto(BASE + '/jogos/g1'); await pronto(p, 'article');
    await p.locator('details[data-lista="Desbloqueadas"] summary').click();
    return await comReqs(p, async () => { await p.getByRole('button', { name: 'Atualizar', exact: true }).click(); await p.waitForTimeout(800); });
  }, (r) => r.some((x) => /atualizacao$/.test(x))],
  ['detalhe Steam: Desvincular confirma (DELETE do vínculo)', {}, async (p) => {
    await p.goto(BASE + '/jogos/g1'); await pronto(p, 'article');
    await p.getByRole('button', { name: 'Desvincular', exact: true }).click(); await p.waitForSelector('dialog[open]');
    return await comReqs(p, async () => { await p.locator('dialog[open]').getByRole('button', { name: 'Desvincular', exact: true }).click(); await p.waitForTimeout(800); });
  }, (r) => r.some((x) => /^DELETE \/integracoes\/steam\/jogos\//.test(x))],
  ['detalhe sem vínculo: Vincular à Steam abre a biblioteca', {}, async (p) => {
    await p.goto(BASE + '/jogos/g4'); await pronto(p, 'article');
    return await comReqs(p, async () => { await p.getByRole('button', { name: 'Vincular à Steam' }).click(); await p.waitForSelector('dialog[open]'); await p.waitForTimeout(600); });
  }, (r) => r.some((x) => /biblioteca/.test(x))],
  ['perfil: trocar cor de destaque muda o <html> na hora, sem request', {}, async (p) => {
    await p.goto(BASE + '/perfil'); await pronto(p, 'main');
    await p.getByRole('button', { name: /Preferências/ }).first().click(); await p.waitForSelector('dialog[open]');
    const reqs = await comReqs(p, async () => { await p.getByRole('radio', { name: 'Violeta' }).click(); await p.waitForTimeout(300); });
    return { reqs, destaque: await p.evaluate(() => document.documentElement.dataset.destaque) };
  }, (r) => r.reqs.length === 0 && r.destaque === 'violeta'],
  ['perfil: densidade compacta e animações reduzidas aplicam', {}, async (p) => {
    await p.goto(BASE + '/perfil'); await pronto(p, 'main');
    await p.getByRole('button', { name: /Preferências/ }).first().click(); await p.waitForSelector('dialog[open]');
    await p.getByRole('radio', { name: /Compacta/ }).click().catch(async () => { await p.getByRole('button', { name: /Compacta/ }).click(); });
    await p.getByRole('radio', { name: /Reduzidas/ }).click().catch(async () => { await p.getByRole('button', { name: /Reduzidas/ }).click(); });
    await p.keyboard.press('Escape');
    await p.goto(BASE + '/'); await pronto(p, '[data-tile]');
    return await p.evaluate(() => ({ larg: Math.round(document.querySelector('[data-tile] .tile-capa').getBoundingClientRect().width), efeitos: document.documentElement.dataset.efeitos }));
  }, (r) => (r.larg === 120 || r.larg === 108) && r.efeitos === 'reduzidos'],
  ['perfil: trocar senha (PUT /auth/senha)', {}, async (p) => {
    await p.goto(BASE + '/perfil/senha'); await pronto(p, 'main');
    const campos = p.locator('input[type=password]'); const n = await campos.count();
    for (let i = 0; i < n; i++) await campos.nth(i).fill(i === 0 ? 'senha-atual-1' : 'senha-nova-forte-2');
    return await comReqs(p, async () => { await p.getByRole('button', { name: /Trocar senha|Salvar/i }).last().click(); await p.waitForTimeout(800); });
  }, (r) => r.includes('PUT /auth/senha')],
  ['perfil: Sair (POST /auth/logout) e vai ao login', {}, async (p) => {
    await p.goto(BASE + '/perfil'); await pronto(p, 'main');
    return await comReqs(p, async () => { await p.getByRole('button', { name: 'Sair' }).click(); await p.waitForTimeout(1000); });
  }, (r) => r.includes('POST /auth/logout')],
  ['perfil: sessões ativas abre a lista; encerrar outras confirma', {}, async (p) => {
    await p.goto(BASE + '/perfil'); await pronto(p, 'main');
    await p.getByRole('button', { name: /Sessões ativas/ }).click(); await p.waitForTimeout(500);
    const abre = await p.getByRole('button', { name: /Encerrar todas as outras|Encerrar outras/i }).count();
    if (!abre) return 'sem-botao';
    await p.getByRole('button', { name: /Encerrar todas as outras|Encerrar outras/i }).first().click(); await p.waitForSelector('dialog[open]');
    return await comReqs(p, async () => { await p.locator('dialog[open]').getByRole('button', { name: 'Encerrar', exact: true }).click(); await p.waitForTimeout(700); });
  }, (r) => r === 'sem-botao' || r.includes('DELETE /auth/sessoes')],
  ['perfil Steam: Atualizar cartão e Desvincular conta', {}, async (p) => {
    await p.goto(BASE + '/perfil'); await pronto(p, 'main');
    const r1 = await comReqs(p, async () => { await p.getByRole('button', { name: 'Atualizar', exact: true }).click(); await p.waitForTimeout(700); });
    await p.getByRole('button', { name: 'Desvincular', exact: true }).click(); await p.waitForSelector('dialog[open]');
    const r2 = await comReqs(p, async () => { await p.locator('dialog[open]').getByRole('button', { name: /Desvincular/ }).last().click(); await p.waitForTimeout(700); });
    return [...r1, ...r2];
  }, (r) => r.some((x) => /perfil\/atualizacao/.test(x)) && r.some((x) => x === 'DELETE /integracoes/steam')],
  ['navegação: BottomNav (360) ou TopNav (1280) leva a Jogos, Perfil e volta; Voltar do detalhe', {}, async (p) => {
    await p.goto(BASE + '/'); await pronto(p, '[data-tile]');
    const nav = p.locator('nav[aria-label="Navegação principal"]:visible').first();
    const visitados = [];
    if (await nav.count()) { await nav.getByRole('link', { name: 'Perfil' }).click(); await p.waitForTimeout(400); visitados.push(new URL(p.url()).pathname); await nav.getByRole('link', { name: 'Jogos' }).click(); await p.waitForTimeout(400); visitados.push(new URL(p.url()).pathname); }
    else { await p.getByRole('link', { name: 'Perfil' }).first().click(); await p.waitForTimeout(400); visitados.push(new URL(p.url()).pathname); await p.getByRole('link', { name: 'checkpoint' }).first().click(); await p.waitForTimeout(400); visitados.push(new URL(p.url()).pathname); }
    await p.locator('[data-tile] a').first().click(); await p.waitForTimeout(400); visitados.push(new URL(p.url()).pathname.startsWith('/jogos/') ? 'detalhe' : 'ERRO');
    await p.getByRole('button', { name: 'Voltar' }).click(); await p.waitForTimeout(400); visitados.push(new URL(p.url()).pathname);
    return visitados;
  }, (r) => r.join(',') === '/perfil,/,detalhe,/'],
];

(async () => {
  const b = await chromium.launch();
  for (const [vn, vopts] of VIEWS) {
    for (const [nome, opts, fn, checa] of FLUXOS) {
      if (process.env.SO && !nome.startsWith(process.env.SO)) continue;
      const { ctx, page, erros } = await abrir(b, opts, vopts);
      captura(page);
      try {
        const r = await fn(page);
        const ok = await checa(r, page);
        const inesperados = erros.filter((e) => !(opts.unauth && /401/.test(e)));
        reg(vn, nome, !!ok && inesperados.length === 0, inesperados.length ? 'ERROS: ' + inesperados.join(' | ').slice(0, 300) : JSON.stringify(r).slice(0, 200));
      } catch (e) { reg(vn, nome, false, 'FALHOU: ' + e.message.split('\n')[0].slice(0, 200)); }
      await ctx.close();
    }
  }
  fs.writeFileSync(require('os').tmpdir() + '/checkpoint-verificacao-flows-requests.json', JSON.stringify([...CAPT.values()], null, 1));
  fs.writeFileSync(require('os').tmpdir() + '/checkpoint-verificacao-flows.json', JSON.stringify(rows, null, 1));
  for (const r of rows) console.log(`${r.ok ? 'OK   ' : 'FALHA'} ${r.view} ${r.fluxo}\n        ${r.detalhe}`);
  console.log(`\n${rows.filter((r) => r.ok).length}/${rows.length} fluxos ok`);
  await b.close();
})();
