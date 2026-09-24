import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeStorage, quotaError, securityError } from './fake-storage';
import { defineKey, type StorageScope } from './keys';
import { createStorage } from './storage';

let counter = 0;
/** O registro é global ao módulo: cada teste usa nomes só seus. */
const name = (label: string) => `${label}-${(counter += 1)}`;

const isNumber = (valor: unknown): valor is number => typeof valor === 'number';

function numberKey(escopo: StorageScope = 'dispositivo', padrao = 7) {
  return defineKey<number>({ nome: name('num'), escopo, padrao, validar: isNumber });
}

let fake: FakeStorage;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fake = new FakeStorage();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
});

describe('defineKey', () => {
  it('lança se o nome já estiver registrado', () => {
    const key = numberKey();

    expect(() =>
      defineKey<number>({ nome: key.nome, escopo: 'dispositivo', padrao: 0, validar: isNumber }),
    ).toThrow(/já registrada/);
  });
});

describe('get e set', () => {
  it('grava como JSON sob o prefixo checkpoint:', () => {
    const storage = createStorage(() => fake);
    const key = numberKey();

    storage.set(key, 42);

    expect(fake.snapshot()).toEqual({ [`checkpoint:${key.nome}`]: '42' });
    expect(storage.get(key)).toBe(42);
  });

  it('chave ausente devolve o padrão, sem gravar nada', () => {
    const storage = createStorage(() => fake);

    expect(storage.get(numberKey('dispositivo', 7))).toBe(7);
    expect(fake.snapshot()).toEqual({});
  });

  it('guarda objetos por JSON', () => {
    const storage = createStorage(() => fake);
    const key = defineKey<{ a: number }>({
      nome: name('obj'),
      escopo: 'dispositivo',
      padrao: { a: 0 },
      validar: (v): v is { a: number } =>
        typeof v === 'object' && v !== null && typeof (v as { a?: unknown }).a === 'number',
    });

    storage.set(key, { a: 5 });

    expect(storage.get(key)).toEqual({ a: 5 });
  });

  it('JSON inválido devolve o padrão, apaga a chave e não lança (CA-18)', () => {
    const storage = createStorage(() => fake);
    const key = numberKey('dispositivo', 7);
    fake.seed({ [`checkpoint:${key.nome}`]: '{quebrado' });

    expect(storage.get(key)).toBe(7);
    expect(fake.snapshot()).toEqual({});
  });

  it('valor que o validador recusa devolve o padrão e apaga a chave (CA-18)', () => {
    const storage = createStorage(() => fake);
    const key = numberKey('dispositivo', 7);
    fake.seed({ [`checkpoint:${key.nome}`]: '"texto"' });

    expect(storage.get(key)).toBe(7);
    expect(fake.snapshot()).toEqual({});
  });

  it('valor sem JSON (undefined) e circular não gravam nada e não lançam', () => {
    const storage = createStorage(() => fake);
    const key = defineKey<unknown>({
      nome: name('any'),
      escopo: 'dispositivo',
      padrao: null,
      validar: (_v): _v is unknown => true,
    });
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => storage.set(key, undefined)).not.toThrow();
    expect(() => storage.set(key, circular)).not.toThrow();
    expect(fake.snapshot()).toEqual({});
  });
});

describe('remove', () => {
  it('apaga a chave', () => {
    const storage = createStorage(() => fake);
    const key = numberKey();
    storage.set(key, 1);

    storage.remove(key);

    expect(fake.snapshot()).toEqual({});
    expect(storage.get(key)).toBe(key.padrao);
  });
});

describe('armazenamento com falha: nunca lança, cai para a memória (CA-19)', () => {
  it('getItem lançando devolve o padrão', () => {
    const storage = createStorage(() => fake);
    const key = numberKey('dispositivo', 7);
    fake.getError = securityError();

    expect(storage.get(key)).toBe(7);
  });

  it('setItem lançando guarda em memória, sem aviso (não é cota cheia)', () => {
    const storage = createStorage(() => fake);
    const key = numberKey();
    fake.setError = securityError();

    expect(() => storage.set(key, 5)).not.toThrow();

    expect(storage.get(key)).toBe(5);
    expect(fake.snapshot()).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });

  it('o próprio acesso ao armazenamento lançando (bloqueado): tudo funciona em memória', () => {
    const storage = createStorage(() => {
      throw securityError();
    });
    const key = numberKey('usuario');

    expect(() => storage.set(key, 9)).not.toThrow();
    expect(storage.get(key)).toBe(9);
    expect(() => storage.remove(key)).not.toThrow();
    expect(storage.get(key)).toBe(key.padrao);
    storage.set(key, 3);
    expect(() => storage.clearScope('usuario')).not.toThrow();
    expect(storage.get(key)).toBe(key.padrao);
    expect(warn).not.toHaveBeenCalled();
  });

  it('cota cheia: guarda em memória e avisa UMA vez por sessão, sem o valor', () => {
    const storage = createStorage(() => fake);
    const a = numberKey();
    const b = numberKey();
    fake.setError = quotaError();

    storage.set(a, 111111);
    storage.set(b, 222222);

    expect(storage.get(a)).toBe(111111);
    expect(storage.get(b)).toBe(222222);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('111111');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('222222');
  });

  it('cota cheia no Firefox (código 1014) também conta', () => {
    const storage = createStorage(() => fake);
    fake.setError = Object.assign(new Error('x'), { name: 'NS_ERROR_DOM_QUOTA_REACHED' });

    storage.set(numberKey(), 1);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('quando o armazenamento volta a aceitar, o valor persiste e a memória deixa de valer', () => {
    const storage = createStorage(() => fake);
    const key = numberKey();
    fake.setError = quotaError();
    storage.set(key, 1);

    fake.setError = null;
    storage.set(key, 2);

    expect(fake.snapshot()).toEqual({ [`checkpoint:${key.nome}`]: '2' });
    expect(storage.get(key)).toBe(2);
  });

  it('remove apaga também o que só existia em memória', () => {
    const storage = createStorage(() => fake);
    const key = numberKey();
    fake.setError = quotaError();
    storage.set(key, 1);

    storage.remove(key);

    expect(storage.get(key)).toBe(key.padrao);
  });
});

describe('clearScope', () => {
  it('apaga só as chaves REGISTRADAS daquele escopo (nunca por prefixo ou substring)', () => {
    const storage = createStorage(() => fake);
    const usuarioA = numberKey('usuario');
    const usuarioB = numberKey('usuario');
    const dispositivo = numberKey('dispositivo');
    storage.set(usuarioA, 1);
    storage.set(usuarioB, 2);
    storage.set(dispositivo, 3);
    fake.seed({
      'checkpoint:nao-registrada': '"x"',
      'checkpoint:usuario': '"sem registro, mas com o nome do escopo"',
      'outro-app:x': '"y"',
    });

    storage.clearScope('usuario');

    expect(fake.snapshot()).toEqual({
      [`checkpoint:${dispositivo.nome}`]: '3',
      'checkpoint:nao-registrada': '"x"',
      'checkpoint:usuario': '"sem registro, mas com o nome do escopo"',
      'outro-app:x': '"y"',
    });
  });

  it('o outro escopo não é tocado', () => {
    const storage = createStorage(() => fake);
    const dispositivo = numberKey('dispositivo');
    storage.set(dispositivo, 3);

    storage.clearScope('usuario');

    expect(storage.get(dispositivo)).toBe(3);
  });
});
