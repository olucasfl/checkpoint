const { chromium } = require('playwright');
const { BASE, abrir, pronto } = require('./mock');
(async () => {
  const b = await chromium.launch();
  for (const [vn, o] of [['1280', { viewport: { width: 1280, height: 900 } }], ['360', { viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true }]]) {
    const { ctx, page, erros } = await abrir(b, {}, o);
    await page.goto(BASE + '/'); await pronto(page, '[data-tile]');
    const topo = page.getByRole('button', { name: 'Adicionar jogo' });
    if (await topo.count() && await topo.first().isVisible()) await topo.first().click(); else await page.locator('nav[aria-label="Navegação principal"] button').first().click();
    await page.waitForSelector('dialog[open]');
    await page.getByRole('button', { name: 'Buscar na Steam' }).click(); await page.waitForTimeout(500);
    const abertos = () => page.evaluate(() => document.querySelectorAll('dialog[open]').length);
    const r = [await abertos()];
    await page.keyboard.press('Escape'); await page.waitForTimeout(300); r.push(await abertos());
    await page.keyboard.press('Escape'); await page.waitForTimeout(300); r.push(await abertos());
    console.log(vn, 'diálogos abertos após 0, 1 e 2 Esc:', r.join(' -> '), '| erros:', erros.length);
    await ctx.close();
  }
  await b.close();
})();
