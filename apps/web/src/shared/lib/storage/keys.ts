/**
 * Registro único das chaves de armazenamento local. Toda chave é declarada aqui (ou num arquivo de
 * feature, mas sempre por `defineKey`): sem registro não há como o módulo saber o escopo, o padrão e
 * como validar o valor, nem o que apagar no `clearScope`.
 */

/** `dispositivo` sobrevive ao logout; `usuario` é apagado nele (spec autenticacao). */
export type StorageScope = 'dispositivo' | 'usuario';

export interface StorageKey<T> {
  /** Sem o prefixo; o nome gravado é `checkpoint:${nome}`. */
  nome: string;
  escopo: StorageScope;
  padrao: T;
  validar: (valor: unknown) => valor is T;
}

/**
 * O `localhost:5173` é compartilhado com outros projetos em dev: o prefixo evita pisar nas chaves
 * deles e deles pisarem nas nossas.
 */
export const STORAGE_PREFIX = 'checkpoint:';

const registry = new Map<string, StorageKey<unknown>>();

/** Registra uma chave. Lança se o nome já existir: duas features com a mesma chave se corromperiam. */
export function defineKey<T>(def: StorageKey<T>): StorageKey<T> {
  if (registry.has(def.nome)) {
    throw new Error(`Chave de armazenamento já registrada: "${def.nome}"`);
  }
  registry.set(def.nome, def);
  return def;
}

export function registeredKeys(): readonly StorageKey<unknown>[] {
  return [...registry.values()];
}

/** Nome como fica gravado no armazenamento nativo. */
export function storedName(key: { nome: string }): string {
  return `${STORAGE_PREFIX}${key.nome}`;
}
