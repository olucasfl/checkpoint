// Clica em CADA elemento interativo de cada tela/diálogo, em 360 e 1280 px, contra a API mockada em OUTRA origem.
// Falha em: erro/aviso de console, pageerror, HTTP >= 400 inesperado, tela em branco, elemento sem nome acessível,
// elemento visível que não dá para clicar.
const { chromium } = require('playwright');
const fs = require('fs');
const { BASE, abrir, pronto, jogosFeios, instalar } = require('./mock');
const CEN = process.env.CEN || 'feliz';
const ERRO = { statusCode: 0, message: 'erro injetado' };
const OVERRIDE_FEIO = (p, m) => {
  if (p === '/integracoes/steam/perfil') return { status: 409, body: { ...ERRO, statusCode: 409, code: 'PLATAFORMA_PERFIL_PRIVADO', message: 'Perfil privado' } };
  if (/^\/integracoes\/steam\/jogos\//.test(p) && m === 'GET') return { status: 502, body: { ...ERRO, statusCode: 502, code: 'PLATAFORMA_INDISPONIVEL', message: 'Steam fora do ar' } };
  if (/^\/integracoes\/steam\/jogos\//.test(p) && m === 'PUT') return { status: 409, body: { ...ERRO, statusCode: 409, code: 'PLATAFORMA_ITEM_JA_VINCULADO', message: 'Já ligado' } };
  if (/^\/games\/[^/]+$/.test(p) && m === 'PATCH') return { status: 409, body: { statusCode: 409, message: 'Já existe esse jogo nesta plataforma', fields: { titulo: 'Já existe esse jogo nesta plataforma' } } };
  if (p === '/games' && m === 'POST') return { status: 400, body: { statusCode: 400, code: 'VALIDACAO', message: 'Dados inválidos', fields: { titulo: 'Informe o título' } } };
  return undefined;
};
const ESPERADO_FEIO = /http (400|409|502)|Failed to load resource.*(400|404|409|502)/;

const VIEWS = [
  ['1280', { viewport: { width: 1280, height: 900 } }],
  ['360', { viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true }],
];

const ADICIONAR = async (p) => {
  const topo = p.getByRole('button', { name: 'Adicionar jogo' });
  if (await topo.count() && await topo.first().isVisible()) await topo.first().click();
  else await p.locator('nav[aria-label="Navegação principal"] button').first().click();
  await p.waitForSelector('dialog[open]');
};
const BUSCAR = async (p) => { await ADICIONAR(p); await p.getByRole('button', { name: 'Buscar na Steam' }).click(); await p.waitForTimeout(600); };
const LIGADO = async (p) => { await BUSCAR(p); await p.getByRole('button', { name: /Criar jogo: Jogo Sintetico/ }).click(); await p.waitForTimeout(400); };

// [id, url, opts, setup, escopo('page'|'dialog'), soDesktop, esperado401]
const ESTADOS = [
  ['catalogo', '/', {}, null, 'page'],
  ['catalogo?status=ZERADO', '/?status=ZERADO', {}, null, 'page'],
  ['catalogo-vazio', '/', { games: [] }, null, 'page'],
  ['form-novo', '/', {}, ADICIONAR, 'dialog'],
  ['form-buscar-steam', '/', {}, BUSCAR, 'dialog'],
  ['form-ligado', '/', {}, LIGADO, 'dialog'],
  ['tile-editar', '/', {}, async (p) => { await p.locator('[data-tile]').first().hover(); await p.getByRole('button', { name: /^Editar / }).first().click(); await p.waitForSelector('dialog[open]'); }, 'dialog', true],
  ['tile-remover', '/', {}, async (p) => { await p.locator('[data-tile]').first().hover(); await p.getByRole('button', { name: /^Remover / }).first().click(); await p.waitForSelector('dialog[open]'); }, 'dialog', true],
  ['adicionar-da-prateleira', '/', {}, async (p) => { await p.locator('[data-prateleira=QUERO_JOGAR] [data-adicionar] button').click(); await p.waitForSelector('dialog[open]'); }, 'dialog'],
  ['detalhe-com-steam', '/jogos/g1', {}, null, 'page'],
  ['detalhe-sem-steam', '/jogos/g4', {}, null, 'page'],
  ['detalhe-120', '/jogos/g2', {}, null, 'page'],
  ['detalhe-editar', '/jogos/g1', {}, async (p) => { await p.getByRole('button', { name: 'Editar', exact: true }).click(); await p.waitForSelector('dialog[open]'); }, 'dialog'],
  ['detalhe-excluir', '/jogos/g4', {}, async (p) => { await p.getByRole('button', { name: 'Excluir', exact: true }).click(); await p.waitForSelector('dialog[open]'); }, 'dialog'],
  ['detalhe-desvincular', '/jogos/g1', {}, async (p) => { await p.getByRole('button', { name: 'Desvincular', exact: true }).click(); await p.waitForSelector('dialog[open]'); }, 'dialog'],
  ['detalhe-vincular', '/jogos/g4', {}, async (p) => { await p.getByRole('button', { name: 'Vincular à Steam' }).click(); await p.waitForSelector('dialog[open]'); await p.waitForTimeout(600); }, 'dialog'],
  ['feio-detalhe-script-html', '/jogos/g1', {}, null, 'page'],
  ['feio-detalhe-zero-conquistas', '/jogos/g2', {}, null, 'page'],
  ['feio-detalhe-conquistas-nulas', '/jogos/g3', {}, null, 'page'],
  ['feio-detalhe-plataforma-antiga', '/jogos/g6', {}, null, 'page'],
  ['feio-editar-plataforma-antiga', '/jogos/g6', {}, async (p) => { await p.getByRole('button', { name: 'Editar', exact: true }).click(); await p.waitForSelector('dialog[open]'); }, 'dialog'],
  ['feio-editar-script-html', '/jogos/g1', {}, async (p) => { await p.getByRole('button', { name: 'Editar', exact: true }).click(); await p.waitForSelector('dialog[open]'); }, 'dialog'],
  ['detalhe-inexistente', '/jogos/naoexiste', {}, null, 'page'],
  ['perfil', '/perfil', {}, null, 'page'],
  ['perfil-preferencias', '/perfil', {}, async (p) => { await p.getByRole('button', { name: /Preferências/ }).first().click(); await p.waitForSelector('dialog[open]'); }, 'dialog'],
  ['perfil-sessoes', '/perfil', {}, async (p) => { await p.getByRole('button', { name: /Sessões ativas/ }).first().click(); await p.waitForTimeout(500); }, 'page'],
  ['perfil-excluir-conta', '/perfil', {}, async (p) => { await p.getByRole('button', { name: /Excluir conta/i }).first().click(); await p.waitForSelector('dialog[open]'); }, 'dialog'],
  ['perfil-senha', '/perfil/senha', {}, null, 'page'],
  ['status', '/status', {}, null, 'page'],
  ['login', '/login', { unauth: true }, null, 'page', false, true],
  ['registro', '/registro', { unauth: true }, null, 'page', false, true],
];

const SEL = 'a[href],button,[role=button],[role=tab],[role=radio],summary,input:not([type=hidden]),select,textarea';

// marca os elementos visíveis (do escopo) com data-cc e devolve descritores
const marcar = ([escopo, SEL]) => {
  const abertos = document.querySelectorAll('dialog[open]');
  const raiz = escopo === 'dialog' ? abertos[abertos.length - 1] : document;
  if (!raiz) return null;
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const nomeDe = (e) => {
    const al = e.getAttribute('aria-label'); if (al && al.trim()) return al.trim();
    const lb = e.getAttribute('aria-labelledby'); if (lb) { const t = lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim(); if (t) return t; }
    if (e.id) { const l = document.querySelector(`label[for="${CSS.escape(e.id)}"]`); if (l && l.textContent.trim()) return l.textContent.trim(); }
    const wl = e.closest('label'); if (wl && wl.textContent.trim()) return wl.textContent.trim();
    const clone = e.cloneNode(true); clone.querySelectorAll('[aria-hidden=true],.icon,svg').forEach((n) => n.remove());
    const tx = (clone.textContent || '').trim().replace(/\s+/g, ' '); if (tx) return tx;
    return (e.getAttribute('title') || e.getAttribute('alt') || e.getAttribute('placeholder') || '').trim();
  };
  const out = []; let i = 0;
  for (const e of raiz.querySelectorAll(SEL)) {
    if (escopo === 'page' && e.closest('dialog')) continue;
    if (escopo === 'dialog' && e.closest('dialog') !== raiz) continue;
    if (!vis(e)) continue;
    e.setAttribute('data-cc', String(i));
    out.push({ i, tag: e.tagName.toLowerCase() + (e.type && e.tagName === 'INPUT' ? `[${e.type}]` : ''), nome: nomeDe(e).slice(0, 50), href: e.getAttribute('href') || undefined, hidden: e.hasAttribute('hidden'), desabilitado: e.disabled === true || e.getAttribute('aria-disabled') === 'true' });
    i++;
  }
  return out;
};

const mkOpts = (o) => (CEN === 'feio' ? { ...o, games: o.games ?? jogosFeios(), override: OVERRIDE_FEIO } : o);
const rows = [];
let falhas = 0;
const reg = (view, estado, el, resultado, ok) => { rows.push({ view, estado, elemento: el, resultado, ok }); if (!ok) falhas++; };

(async () => {
  const b = await chromium.launch();
  for (const [vn, vopts] of VIEWS) {
    for (const [id, url, opts, setup, escopo, soDesktop, esperado401] of ESTADOS) {
      if (soDesktop && vn === '360') continue;
      if (process.env.ONLY && !process.env.ONLY.split(',').includes(id)) continue;
      // 1) enumera
      let lista;
      {
        const { ctx, page, erros } = await abrir(b, mkOpts(opts), vopts);
        try {
          await page.goto(BASE + url); await pronto(page, 'body');
          await page.waitForTimeout(500);
          if (setup) await setup(page);
          lista = await page.evaluate(marcar, [escopo, SEL]);
        } catch (e) { reg(vn, id, '(preparar o estado)', 'FALHOU: ' + e.message.split('\n')[0].slice(0, 120), false); await ctx.close(); continue; }
        await ctx.close();
      }
      if (!lista || lista.length === 0) { reg(vn, id, '(nenhum elemento)', 'estado sem elementos', false); continue; }
      // 2) clica em cada um, com página limpa (contexto compartilhado do estado: o cache HTTP do Vite fica quente)
      const compartilhado = await b.newContext(vopts);
      for (const el of lista) {
        const rotulo = `${el.tag} "${el.nome}"${el.href ? ' → ' + el.href : ''}`;
        if (el.desabilitado) { reg(vn, id, rotulo, 'ok (desabilitado por design: não clicável)', true); continue; }
        if (!el.nome && el.tag !== 'input[range]' && !el.hidden) { reg(vn, id, rotulo, 'SEM NOME ACESSÍVEL', false); }
        const page = await compartilhado.newPage(); const erros = [];
        page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
        page.on('console', (mm) => { if (['error', 'warning'].includes(mm.type())) erros.push(mm.type() + ': ' + mm.text().slice(0, 300)); });
        page.on('requestfailed', (rq) => erros.push('requestfailed: ' + rq.method() + ' ' + rq.url().slice(0, 120)));
        page.on('response', (rs) => { if (rs.status() >= 400) erros.push('http ' + rs.status() + ' ' + rs.request().method() + ' ' + rs.url().slice(0, 120)); });
        await instalar(page, mkOpts(opts));
        try {
          await page.goto(BASE + url); await pronto(page, 'body'); await page.waitForTimeout(400);
          if (setup) await setup(page);
          const l2 = await page.evaluate(marcar, [escopo, SEL]);
          const alvo = l2.find((x) => x.i === el.i && x.tag === el.tag && x.nome === el.nome);
          if (!alvo) { reg(vn, id, rotulo, 'elemento mudou entre carregamentos', false); await page.close(); continue; }
          const loc = page.locator(`[data-cc="${el.i}"]`);
          erros.length = 0;
          const antes = page.url();
          // ações do tile só existem com hover
          const tile = loc.locator('xpath=ancestor::*[@data-tile]');
          if (await tile.count()) await tile.first().hover({ timeout: 3000 }).catch(() => {});
          if (el.tag.startsWith('input[file') || el.tag.startsWith('input[file]')) { reg(vn, id, rotulo, 'ok (campo de arquivo: não abre seletor)', true); await page.close(); continue; }
          let tipo = 'clique';
          if (el.tag === 'select') { await loc.focus(); tipo = 'foco'; }
          else if (el.tag === 'input[range]') { await loc.focus(); await page.keyboard.press('ArrowRight'); tipo = 'teclado'; }
          else if (el.tag.startsWith('input') || el.tag === 'textarea') { await loc.click({ timeout: 4000 }); await page.keyboard.type('a'); tipo = 'digitar'; }
          else await loc.click({ timeout: 4000 });
          await page.waitForTimeout(450);
          const info = await page.evaluate(() => ({ raiz: (document.querySelector('#root')?.innerText || '').trim().length, dialog: !!document.querySelector('dialog[open]'), path: location.pathname + location.search }));
          const permitidos = (esperado401 ? erros.filter((x) => !/401/.test(x)) : erros).filter((x) => !(CEN === 'feio' && ESPERADO_FEIO.test(x)));
          let res, ok = true;
          if (permitidos.length) { res = 'ERRO: ' + permitidos.join(' | ').slice(0, 260); ok = false; }
          else if (info.raiz === 0) { res = 'TELA EM BRANCO'; ok = false; }
          else res = `ok (${tipo}${info.path !== antes.replace(BASE, '') ? ', foi para ' + info.path : ''}${info.dialog && escopo === 'page' ? ', abriu diálogo' : ''})`;
          if (ok && !/SEM NOME/.test(rows.at(-1)?.resultado || '') ) reg(vn, id, rotulo, res, ok);
          else if (!ok) reg(vn, id, rotulo, res, ok);
          // Esc fecha diálogo sem erro
          if (ok && info.dialog) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); const e2 = erros.filter((x) => !(esperado401 && /401/.test(x))).filter((x) => !(CEN === 'feio' && ESPERADO_FEIO.test(x))); if (e2.length) reg(vn, id, rotulo + ' [Esc]', 'ERRO: ' + e2.join(' | ').slice(0, 200), false); }
        } catch (e) {
          reg(vn, id, rotulo, 'NÃO CLICÁVEL/FALHOU: ' + e.message.split('\n')[0].slice(0, 160), false);
        }
        await page.close();
      }
      await compartilhado.close();
      // 3) Tab e Esc no estado
      {
        const { ctx, page, erros } = await abrir(b, mkOpts(opts), vopts);
        try {
          await page.goto(BASE + url); await pronto(page, 'body'); await page.waitForTimeout(400);
          if (setup) await setup(page);
          erros.length = 0;
          const vistos = new Set();
          for (let k = 0; k < 40; k++) { await page.keyboard.press('Tab'); vistos.add(await page.evaluate(() => { const a = document.activeElement; return a ? a.tagName + ':' + (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 20) : ''; })); }
          const pe = esperado401 ? erros.filter((x) => !/401/.test(x)) : erros;
          reg(vn, id, 'Tab x40', pe.length ? 'ERRO: ' + pe.join(' | ').slice(0, 200) : `ok (${vistos.size} pontos de foco distintos)`, pe.length === 0 && vistos.size > 1);
          if (escopo === 'dialog') { await page.keyboard.press('Escape'); await page.waitForTimeout(300); const aberto = await page.evaluate(() => !!document.querySelector('dialog[open]')); reg(vn, id, 'Esc no diálogo', aberto ? 'NÃO FECHOU' : 'ok (fechou)', !aberto); }
        } catch (e) { reg(vn, id, 'Tab/Esc', 'FALHOU: ' + e.message.split('\n')[0].slice(0, 120), false); }
        await ctx.close();
      }
      console.error(`.. ${vn} ${id}: ${lista.length} elementos`);
    }
  }
  fs.writeFileSync(require('os').tmpdir() + '/checkpoint-verificacao-clicker-' + CEN + (process.env.ONLY ? '-sub' : '') + '.json', JSON.stringify(rows, null, 1));
  const porEstado = {};
  for (const r of rows) { const k = `${r.view} ${r.estado}`; (porEstado[k] ||= { total: 0, ok: 0, falhas: [] }); porEstado[k].total++; if (r.ok) porEstado[k].ok++; else porEstado[k].falhas.push(`${r.elemento}: ${r.resultado}`); }
  console.log(JSON.stringify({ totalVerificacoes: rows.length, falhas, porEstado }, null, 1));
  await b.close();
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
