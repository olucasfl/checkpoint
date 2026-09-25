import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storage } from '@/shared/lib/storage/storage';
import { storedName } from '@/shared/lib/storage/keys';
import { isPrefs, PREFS, PREFS_PADRAO, prefsDoUsuario, type Prefs } from './prefs';
import {
  alterarPrefs,
  definirUsuario,
  getPrefs,
  iniciarPrefs,
  resetPrefsForTests,
} from './prefs-store';

const VIOLETA: Prefs = { ...PREFS_PADRAO, destaque: 'violeta' };

beforeEach(() => {
  storage.raw.removeAllWithPrefix('checkpoint:');
  resetPrefsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a chave checkpoint:prefs', () => {
  it('uma chave só, escopo dispositivo (sobrevive ao logout)', () => {
    expect(storedName(PREFS)).toBe('checkpoint:prefs');
    expect(PREFS.escopo).toBe('dispositivo');
    expect(PREFS.padrao).toEqual({ ultimoUsuario: null, porUsuario: {} });
  });

  it('logout (clearScope usuario) não apaga as preferências', () => {
    storage.set(PREFS, { ultimoUsuario: 'ana', porUsuario: { ana: VIOLETA } });

    storage.clearScope('usuario');

    expect(storage.get(PREFS).porUsuario.ana).toEqual(VIOLETA);
  });
});

describe('isPrefs (validador de uma entrada)', () => {
  it('aceita os padrões e cada opção da spec', () => {
    expect(isPrefs(PREFS_PADRAO)).toBe(true);
    expect(isPrefs({ ...PREFS_PADRAO, destaque: 'laranja', filtroInicial: 'QUERO_JOGAR' })).toBe(
      true,
    );
    expect(isPrefs({ ...PREFS_PADRAO, densidade: 'compacta', efeitos: 'reduzidos' })).toBe(true);
    expect(isPrefs({ ...PREFS_PADRAO, plataformasFavoritas: ['PS5', 'PC'] })).toBe(true);
  });

  it.each([
    ['cor fora da paleta', { destaque: 'verde' }],
    ['filtro desconhecido', { filtroInicial: 'PAUSADO' }],
    ['densidade desconhecida', { densidade: 'apertada' }],
    ['efeitos desconhecidos', { efeitos: 'nenhum' }],
    ['9 favoritas', { plataformasFavoritas: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }],
    ['favorita repetida', { plataformasFavoritas: ['PC', 'PC'] }],
    ['favoritas que não são lista', { plataformasFavoritas: 'PC' }],
  ])('recusa: %s', (_caso, parcial) => {
    expect(isPrefs({ ...PREFS_PADRAO, ...parcial })).toBe(false);
  });

  it('recusa campo faltando e valores que não são objeto', () => {
    const { efeitos: _sem, ...incompleta } = PREFS_PADRAO;
    expect(isPrefs(incompleta)).toBe(false);
    expect(isPrefs(null)).toBe(false);
    expect(isPrefs('violeta')).toBe(false);
  });
});

describe('prefsDoUsuario (por usuário)', () => {
  it('devolve as de cada um; quem não tem entrada fica com os padrões', () => {
    const guardadas = { ultimoUsuario: 'ana', porUsuario: { ana: VIOLETA } };

    expect(prefsDoUsuario(guardadas, 'ana')).toEqual(VIOLETA);
    expect(prefsDoUsuario(guardadas, 'bia')).toEqual(PREFS_PADRAO);
    expect(prefsDoUsuario(guardadas, null)).toEqual(PREFS_PADRAO);
  });

  it('entrada inválida de um usuário → padrões SÓ para ele', () => {
    const guardadas = {
      ultimoUsuario: 'ana',
      porUsuario: { ana: { destaque: 'verde' }, bia: VIOLETA },
    };

    expect(prefsDoUsuario(guardadas, 'ana')).toEqual(PREFS_PADRAO);
    expect(prefsDoUsuario(guardadas, 'bia')).toEqual(VIOLETA);
  });
});

describe('store: mesmo navegador, usuários diferentes (CA-20)', () => {
  it('Ana escolhe Violeta; Bia entra e vê Magenta; Ana volta e vê Violeta', () => {
    definirUsuario('ana');
    alterarPrefs({ destaque: 'violeta' });
    expect(document.documentElement.dataset.destaque).toBe('violeta');

    definirUsuario(null); // Ana saiu
    definirUsuario('bia');
    expect(getPrefs().destaque).toBe('magenta');
    expect(document.documentElement.dataset.destaque).toBe('magenta');

    definirUsuario(null);
    definirUsuario('ana');
    expect(getPrefs().destaque).toBe('violeta');
    expect(document.documentElement.dataset.destaque).toBe('violeta');
    expect(storage.get(PREFS).ultimoUsuario).toBe('ana');
  });

  it('sem ninguém logado, alterar não grava nada', () => {
    alterarPrefs({ destaque: 'azul' });

    expect(storage.get(PREFS)).toEqual(PREFS.padrao);
    expect(getPrefs()).toEqual(PREFS_PADRAO);
  });

  it('alterar grava só a entrada de quem está logado', () => {
    storage.set(PREFS, { ultimoUsuario: 'bia', porUsuario: { bia: VIOLETA } });
    definirUsuario('ana');

    alterarPrefs({ densidade: 'compacta' });

    const guardadas = storage.get(PREFS);
    expect(guardadas.porUsuario.ana).toEqual({ ...PREFS_PADRAO, densidade: 'compacta' });
    expect(guardadas.porUsuario.bia).toEqual(VIOLETA);
  });
});

describe('falhas do armazenamento', () => {
  it('JSON corrompido à mão → padrões, sem lançar, e a chave sai (CA-21)', () => {
    storage.raw.set('checkpoint:prefs', '{quebrado');

    expect(() => iniciarPrefs()).not.toThrow();
    expect(getPrefs()).toEqual(PREFS_PADRAO);
    expect(storage.raw.get('checkpoint:prefs')).toBeNull();
  });

  it('armazenamento bloqueado: a mudança vale na hora, sem lançar (CA-22)', () => {
    const bloqueado = new DOMException('bloqueado', 'SecurityError');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw bloqueado;
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw bloqueado;
    });

    expect(() => {
      definirUsuario('ana');
      alterarPrefs({ destaque: 'laranja', efeitos: 'reduzidos' });
    }).not.toThrow();
    expect(getPrefs().destaque).toBe('laranja');
    expect(document.documentElement.dataset.destaque).toBe('laranja');
    expect(document.documentElement.dataset.efeitos).toBe('reduzidos');
  });
});
