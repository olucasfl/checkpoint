import { registeredKeys, storedName, type StorageKey, type StorageScope } from './keys';

/** O que o módulo usa do armazenamento nativo (o `Storage` do navegador satisfaz isto). */
export interface StorageBackend {
  readonly length: number;
  key(index: number): string | null;
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
  removeItem(name: string): void;
}

/** Acesso cru por nome, só para o módulo de migrações (que lida com chaves fora do registro). */
export interface RawStorage {
  get(name: string): string | null;
  set(name: string, value: string): void;
  /** Apaga TODAS as chaves que começam com `prefix`, registradas ou não. */
  removeAllWithPrefix(prefix: string): void;
}

export interface StorageApi {
  /** Nunca lança. Valor ausente, inválido ou corrompido devolve o padrão (o inválido é apagado). */
  get<T>(key: StorageKey<T>): T;
  /** Nunca lança. Se o armazenamento nativo falhar, o valor fica em memória até o fim da sessão. */
  set<T>(key: StorageKey<T>, valor: T): void;
  /** Nunca lança. */
  remove(key: StorageKey<unknown>): void;
  /** Apaga SÓ as chaves REGISTRADAS naquele escopo (nunca varre por prefixo ou substring). */
  clearScope(escopo: StorageScope): void;
  /** @internal usado por `migrations.ts`. */
  raw: RawStorage;
}

/** `QuotaExceededError` tem nomes e códigos diferentes por navegador (Firefox: 1014). */
function isQuotaError(error: unknown): boolean {
  const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown };
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

/**
 * Cria o módulo sobre um armazenamento resolvido sob demanda. `resolveBackend` pode lançar (modo
 * privado, cookies bloqueados: o simples acesso a `window.localStorage` dá `SecurityError`); nesse
 * caso tudo funciona só em memória. Fábrica à parte do singleton para os testes injetarem um falso.
 */
export function createStorage(resolveBackend: () => StorageBackend): StorageApi {
  /** Valores que o armazenamento nativo não aceitou (bloqueado ou cheio). */
  const memory = new Map<string, string>();
  let warnedQuota = false;

  function backend(): StorageBackend | null {
    try {
      return resolveBackend();
    } catch {
      return null;
    }
  }

  function readRaw(name: string): string | null {
    const inMemory = memory.get(name);
    if (inMemory !== undefined) {
      return inMemory;
    }
    try {
      return backend()?.getItem(name) ?? null;
    } catch {
      return null;
    }
  }

  function writeRaw(name: string, value: string): void {
    try {
      const native = backend();
      if (!native) {
        throw new Error('armazenamento indisponível');
      }
      native.setItem(name, value);
      memory.delete(name);
    } catch (error) {
      memory.set(name, value);
      // Um aviso por sessão e sem o valor: ele pode ser dado do usuário.
      if (isQuotaError(error) && !warnedQuota) {
        warnedQuota = true;
        console.warn('Armazenamento local cheio: os dados ficam só em memória nesta sessão.');
      }
    }
  }

  function removeRaw(name: string): void {
    memory.delete(name);
    try {
      backend()?.removeItem(name);
    } catch {
      // Sem acesso ao armazenamento não há o que apagar.
    }
  }

  function removeAllWithPrefix(prefix: string): void {
    for (const name of [...memory.keys()]) {
      if (name.startsWith(prefix)) {
        memory.delete(name);
      }
    }
    try {
      const native = backend();
      if (!native) {
        return;
      }
      // Coleta antes de apagar: remover no meio do laço deslocaria os índices.
      const names: string[] = [];
      for (let index = 0; index < native.length; index += 1) {
        const name = native.key(index);
        if (name !== null && name.startsWith(prefix)) {
          names.push(name);
        }
      }
      for (const name of names) {
        native.removeItem(name);
      }
    } catch {
      // Sem acesso ao armazenamento não há o que apagar.
    }
  }

  return {
    get<T>(key: StorageKey<T>): T {
      const name = storedName(key);
      const raw = readRaw(name);
      if (raw === null) {
        return key.padrao;
      }
      try {
        const parsed: unknown = JSON.parse(raw);
        if (key.validar(parsed)) {
          return parsed;
        }
      } catch {
        // JSON inválido: cai no padrão, como o valor que não passa no validador.
      }
      removeRaw(name);
      return key.padrao;
    },

    set<T>(key: StorageKey<T>, valor: T): void {
      try {
        const raw = JSON.stringify(valor);
        // `undefined`, função e símbolo não têm JSON: não há o que gravar.
        if (typeof raw === 'string') {
          writeRaw(storedName(key), raw);
        }
      } catch {
        // Valor circular ou com BigInt: não grava, e o app segue.
      }
    },

    remove(key: StorageKey<unknown>): void {
      removeRaw(storedName(key));
    },

    clearScope(escopo: StorageScope): void {
      for (const key of registeredKeys()) {
        if (key.escopo === escopo) {
          removeRaw(storedName(key));
        }
      }
    },

    raw: { get: readRaw, set: writeRaw, removeAllWithPrefix },
  };
}

/** O módulo do app, sobre o armazenamento do navegador. Único lugar que o acessa. */
export const storage: StorageApi = createStorage(() => window.localStorage);
