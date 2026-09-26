import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeStorage, securityError } from './fake-storage';
import {
  isPrefs,
  PREFS_PADRAO,
  prefsDoUsuario,
  type PrefsGuardadas,
} from '@/shared/lib/prefs/prefs';
import {
  MIGRATIONS,
  migrarDestaques,
  runStorageMigrations,
  STORAGE_SCHEMA_VERSION,
} from './migrations';
import { createStorage } from './storage';

function setup(entries: Record<string, string> = {}) {
  const fake = new FakeStorage().seed(entries);
  return { fake, raw: createStorage(() => fake).raw };
}

afterEach(() => {
  window.localStorage.clear();
});

describe('constantes', () => {
  it('a versão do schema é 2 e a única migração é a 1 → 2 (cores de destaque)', () => {
    expect(STORAGE_SCHEMA_VERSION).toBe(2);
    expect(Object.keys(MIGRATIONS)).toEqual(['1']);
  });
});

describe('runStorageMigrations', () => {
  it('versão ausente: grava a atual e não toca em mais nada', () => {
    const { fake, raw } = setup({ 'outro-app:x': '"y"' });

    runStorageMigrations({ raw, current: 1 });

    expect(fake.snapshot()).toEqual({ 'checkpoint:versao': '1', 'outro-app:x': '"y"' });
  });

  it('versão igual à atual: não faz nada', () => {
    const migration = vi.fn();
    const { fake, raw } = setup({ 'checkpoint:versao': '2', 'checkpoint:a': '1' });

    runStorageMigrations({ raw, current: 2, migrations: { 1: migration } });

    expect(migration).not.toHaveBeenCalled();
    expect(fake.snapshot()).toEqual({ 'checkpoint:versao': '2', 'checkpoint:a': '1' });
  });

  it('versão menor: aplica as migrações 1→2 e 2→3 em ordem e grava a atual', () => {
    const calls: number[] = [];
    const { fake, raw } = setup({ 'checkpoint:versao': '1', 'checkpoint:a': '1' });

    runStorageMigrations({
      raw,
      current: 3,
      migrations: { 1: () => calls.push(1), 2: () => calls.push(2), 3: () => calls.push(3) },
    });

    expect(calls).toEqual([1, 2]);
    expect(fake.snapshot()).toEqual({ 'checkpoint:versao': '3', 'checkpoint:a': '1' });
  });

  it('parte da versão gravada: 2 → 3 aplica só a migração 2', () => {
    const calls: number[] = [];
    const { raw } = setup({ 'checkpoint:versao': '2' });

    runStorageMigrations({
      raw,
      current: 3,
      migrations: { 1: () => calls.push(1), 2: () => calls.push(2) },
    });

    expect(calls).toEqual([2]);
  });

  it('versão MAIOR (voltou de versão): apaga só checkpoint:* e grava a atual (CA-20)', () => {
    const { fake, raw } = setup({
      'checkpoint:versao': '99',
      'checkpoint:qualquer': '"x"',
      'outro-app:x': '"y"',
      'checkpoint-nao-e-nosso': '"z"',
    });

    runStorageMigrations({ raw, current: 1 });

    expect(fake.snapshot()).toEqual({
      'checkpoint:versao': '1',
      'outro-app:x': '"y"',
      'checkpoint-nao-e-nosso': '"z"',
    });
  });

  it('migração que lança: apaga só checkpoint:*, grava a atual e não lança', () => {
    const { fake, raw } = setup({
      'checkpoint:versao': '1',
      'checkpoint:a': '1',
      'outro-app:x': '"y"',
    });

    expect(() =>
      runStorageMigrations({
        raw,
        current: 2,
        migrations: {
          1: () => {
            throw new Error('quebrou');
          },
        },
      }),
    ).not.toThrow();

    expect(fake.snapshot()).toEqual({ 'checkpoint:versao': '2', 'outro-app:x': '"y"' });
  });

  it('migração que falta no caminho conta como falha: apaga só checkpoint:*', () => {
    const { fake, raw } = setup({ 'checkpoint:versao': '1', 'checkpoint:a': '1' });

    runStorageMigrations({ raw, current: 3, migrations: { 2: () => undefined } });

    expect(fake.snapshot()).toEqual({ 'checkpoint:versao': '3' });
  });

  it.each(['abc', '0', '-1', '1.5', '', '01'])(
    'versão ilegível (%j): não dá para confiar nos dados, apaga só checkpoint:*',
    (stored) => {
      const { fake, raw } = setup({
        'checkpoint:versao': stored,
        'checkpoint:a': '1',
        'outro-app:x': '"y"',
      });

      runStorageMigrations({ raw, current: 1 });

      expect(fake.snapshot()).toEqual({ 'checkpoint:versao': '1', 'outro-app:x': '"y"' });
    },
  );

  it('armazenamento bloqueado: não lança', () => {
    const raw = createStorage(() => {
      throw securityError();
    }).raw;

    expect(() => runStorageMigrations({ raw, current: 1 })).not.toThrow();
    expect(raw.get('checkpoint:versao')).toBe('1');
  });

  it('sem opções, usa o armazenamento do navegador (o jsdom) e a versão atual', () => {
    window.localStorage.setItem('checkpoint:versao', '99');
    window.localStorage.setItem('checkpoint:qualquer', '"x"');
    window.localStorage.setItem('outro-app:x', '"y"');

    runStorageMigrations();

    expect(window.localStorage.getItem('checkpoint:versao')).toBe(String(STORAGE_SCHEMA_VERSION));
    expect(window.localStorage.getItem('checkpoint:qualquer')).toBeNull();
    expect(window.localStorage.getItem('outro-app:x')).toBe('"y"');
  });
});

describe('migração 1 → 2: cores de destaque (troca de design, F1)', () => {
  const entrada = (destaque: string) => ({
    ...PREFS_PADRAO,
    destaque,
    densidade: 'compacta',
    plataformasFavoritas: ['PS5', 'Nintendo Switch'],
  });
  const guardar = (porUsuario: Record<string, unknown>, ultimoUsuario: string | null = null) =>
    JSON.stringify({ ultimoUsuario, porUsuario });
  const lidas = (fake: FakeStorage) =>
    JSON.parse(fake.snapshot()['checkpoint:prefs'] as string) as PrefsGuardadas;

  it('entrada com magenta (o padrão de antes) vira azul, e o resto da entrada fica igual', () => {
    const { fake, raw } = setup({
      'checkpoint:prefs': guardar({ ana: entrada('magenta') }, 'ana'),
    });

    migrarDestaques(raw);

    expect(lidas(fake)).toEqual({ ultimoUsuario: 'ana', porUsuario: { ana: entrada('azul') } });
  });

  it('entrada com o antigo azul (capa-1) cai em azul, sem tentar distinguir de quem ficou no padrão', () => {
    const { fake, raw } = setup({ 'checkpoint:prefs': guardar({ ana: entrada('azul') }) });

    migrarDestaques(raw);

    expect(lidas(fake).porUsuario).toEqual({ ana: entrada('azul') });
    expect(isPrefs(lidas(fake).porUsuario.ana)).toBe(true);
  });

  it('violeta e laranja ficam como estavam', () => {
    const { fake, raw } = setup({
      'checkpoint:prefs': guardar({ ana: entrada('violeta'), bia: entrada('laranja') }),
    });

    migrarDestaques(raw);

    expect(lidas(fake).porUsuario).toEqual({ ana: entrada('violeta'), bia: entrada('laranja') });
  });

  it('várias entradas de uma vez: cada uma segue a sua regra, todas ficam válidas e o ultimoUsuario não muda', () => {
    const { fake, raw } = setup({
      'checkpoint:prefs': guardar(
        { a: entrada('magenta'), b: entrada('azul'), c: entrada('violeta'), d: entrada('laranja') },
        'c',
      ),
      'checkpoint:outra': '"intacta"',
    });

    migrarDestaques(raw);

    const guardadas = lidas(fake);
    expect(guardadas.ultimoUsuario).toBe('c');
    expect(
      Object.values(guardadas.porUsuario).map((e) => (e as { destaque: string }).destaque),
    ).toEqual(['azul', 'azul', 'violeta', 'laranja']);
    expect(Object.values(guardadas.porUsuario).every((e) => isPrefs(e))).toBe(true);
    expect(fake.snapshot()['checkpoint:outra']).toBe('"intacta"');
  });

  it('JSON ilegível: não lança e não reescreve nada (ao ler, a chave devolve os padrões)', () => {
    const { fake, raw } = setup({ 'checkpoint:prefs': '{ isto não é json' });

    expect(() => migrarDestaques(raw)).not.toThrow();

    expect(fake.snapshot()['checkpoint:prefs']).toBe('{ isto não é json');
  });

  it.each([
    ['uma lista', '[1,2]'],
    ['um número', '7'],
    ['sem porUsuario', '{"ultimoUsuario":null}'],
    ['porUsuario que é lista', '{"ultimoUsuario":null,"porUsuario":[]}'],
  ])('formato inesperado (%s): fica como está', (_nome, texto) => {
    const { fake, raw } = setup({ 'checkpoint:prefs': texto });

    migrarDestaques(raw);

    expect(fake.snapshot()['checkpoint:prefs']).toBe(texto);
  });

  it('usuário sem preferência gravada: a chave ausente não é criada, e quem não tem entrada abre com os padrões (azul)', () => {
    const vazia = setup();
    migrarDestaques(vazia.raw);
    expect(vazia.fake.snapshot()).toEqual({});

    const { fake, raw } = setup({
      'checkpoint:prefs': guardar({ ana: entrada('magenta') }, 'novo'),
    });
    migrarDestaques(raw);
    const guardadas = lidas(fake);
    expect(guardadas.porUsuario).not.toHaveProperty('novo');
    expect(prefsDoUsuario(guardadas, 'novo')).toEqual(PREFS_PADRAO);
    expect(prefsDoUsuario(guardadas, 'novo').destaque).toBe('azul');
    expect(prefsDoUsuario(guardadas, 'ana').destaque).toBe('azul');
  });

  it('valor de destaque desconhecido não é tocado: só aquela entrada volta aos padrões (as outras ficam)', () => {
    const { fake, raw } = setup({
      'checkpoint:prefs': guardar({ ana: entrada('roxo'), bia: entrada('magenta') }),
    });

    migrarDestaques(raw);

    const guardadas = lidas(fake);
    expect(isPrefs(guardadas.porUsuario.ana)).toBe(false);
    expect(prefsDoUsuario(guardadas, 'ana')).toEqual(PREFS_PADRAO);
    expect(prefsDoUsuario(guardadas, 'bia')).toEqual(entrada('azul'));
  });

  it('pelo runStorageMigrations: versão 1 → grava a 2 e migra; rodar de novo não muda nada', () => {
    const { fake, raw } = setup({
      'checkpoint:versao': '1',
      'checkpoint:prefs': guardar({ ana: entrada('magenta') }, 'ana'),
    });

    runStorageMigrations({ raw });

    expect(fake.snapshot()['checkpoint:versao']).toBe('2');
    expect(lidas(fake).porUsuario).toEqual({ ana: entrada('azul') });
    const depois = fake.snapshot();

    runStorageMigrations({ raw });

    expect(fake.snapshot()).toEqual(depois);
  });

  it('primeiro uso (sem versão): grava a 2 e não cria preferências', () => {
    const { fake, raw } = setup();

    runStorageMigrations({ raw });

    expect(fake.snapshot()).toEqual({ 'checkpoint:versao': '2' });
  });
});
