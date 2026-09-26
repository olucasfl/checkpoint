const { chromium } = require('playwright');
const { BASE, abrir, pronto, jogos } = require('./mock');
(async () => {
  const b = await chromium.launch();
  for (const [vn, o] of [['1280', { viewport: { width: 1280, height: 900 } }], ['360', { viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true }]]) {
    const dados = jogos(); dados[0].notas = null; // malformado de propósito: força exceção no render do detalhe
    const { ctx, page, erros } = await abrir(b, { games: dados }, o);
    await page.goto(BASE + '/jogos/g1');
    await page.waitForSelector('[data-state="render-error"]', { timeout: 8000 });
    const texto = await page.locator('[role=alert]').first().innerText();
    const nav = await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Navegação principal"]')].some((n) => n.getBoundingClientRect().width > 0));
    // o clique em Perfil (navegação) volta a funcionar
    const link = nav ? page.locator('nav[aria-label="Navegação principal"]:visible').first().getByRole('link', { name: 'Perfil' }) : page.getByRole('link', { name: 'Perfil' }).first();
    await link.click(); await page.waitForTimeout(700);
    const depois = { url: new URL(page.url()).pathname, alertaSumiu: (await page.locator('[data-state="render-error"]').count()) === 0, titulo: (await page.locator('h1').first().innerText()).slice(0, 30) };
    await page.screenshot({ path: __dirname + `/boundary-${vn}.png` });
    console.log(vn, JSON.stringify({ mensagem: texto.split('\n').slice(0, 4).join(' | ').slice(0, 200), navegacaoVisivel: nav, depois, errosDeConsole: erros.length }));
    await ctx.close();
  }
  await b.close();
})();
