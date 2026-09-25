import { beforeEach, describe, expect, it } from 'vitest';
import mainSource from '@/main.tsx?raw';
import { storage } from '@/shared/lib/storage/storage';
import { PREFS, PREFS_PADRAO } from './prefs';
import { aplicarNoHtml, iniciarPrefs, resetPrefsForTests } from './prefs-store';

beforeEach(() => {
  storage.raw.removeAllWithPrefix('checkpoint:');
  resetPrefsForTests();
});

describe('aplicar no <html> antes do render (CA-15)', () => {
  it('iniciarPrefs aplica data-destaque e data-efeitos de quem usou por último, sem React', () => {
    storage.set(PREFS, {
      ultimoUsuario: 'ana',
      porUsuario: { ana: { ...PREFS_PADRAO, destaque: 'violeta', efeitos: 'reduzidos' } },
    });

    iniciarPrefs();

    expect(document.documentElement.dataset.destaque).toBe('violeta');
    expect(document.documentElement.dataset.efeitos).toBe('reduzidos');
  });

  it('sem preferências guardadas → padrões (azul, completos)', () => {
    iniciarPrefs();

    expect(document.documentElement.dataset.destaque).toBe('azul');
    expect(document.documentElement.dataset.efeitos).toBe('completos');
  });

  it('aplicarNoHtml escreve nos atributos que o CSS lê', () => {
    const raiz = document.createElement('html');

    aplicarNoHtml({ ...PREFS_PADRAO, destaque: 'rosa' }, raiz);

    expect(raiz.getAttribute('data-destaque')).toBe('rosa');
    expect(raiz.getAttribute('data-efeitos')).toBe('completos');
  });

  it('o main.tsx chama iniciarPrefs depois das migrações e ANTES do createRoot', () => {
    const migracoes = mainSource.indexOf('runStorageMigrations();');
    const prefs = mainSource.indexOf('iniciarPrefs();');
    const render = mainSource.indexOf('createRoot(');

    expect(migracoes).toBeGreaterThan(-1);
    expect(prefs).toBeGreaterThan(migracoes);
    expect(render).toBeGreaterThan(prefs);
  });
});
