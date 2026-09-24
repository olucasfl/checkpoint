import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeStorage, securityError } from './fake-storage';
import { MIGRATIONS, runStorageMigrations, STORAGE_SCHEMA_VERSION } from './migrations';
import { createStorage } from './storage';

function setup(entries: Record<string, string> = {}) {
  const fake = new FakeStorage().seed(entries);
  return { fake, raw: createStorage(() => fake).raw };
}

afterEach(() => {
  window.localStorage.clear();
});

describe('constantes', () => {
  it('a versão do schema é 1 e não há migrações ainda', () => {
    expect(STORAGE_SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS).toEqual({});
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

    expect(window.localStorage.getItem('checkpoint:versao')).toBe('1');
    expect(window.localStorage.getItem('checkpoint:qualquer')).toBeNull();
    expect(window.localStorage.getItem('outro-app:x')).toBe('"y"');
  });
});
