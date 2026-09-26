import { STORAGE_PREFIX } from './keys';
import { storage, type RawStorage } from './storage';

/**
 * Versão do formato dos dados locais. Toda mudança de formato de uma chave existente sobe esta
 * constante E acrescenta a migração em `MIGRATIONS`, no mesmo commit.
 */
export const STORAGE_SCHEMA_VERSION = 2;

export type Migration = (raw: RawStorage) => void;

const PREFS_NAME = `${STORAGE_PREFIX}prefs`;

/**
 * As cores de destaque da direção "Estante de console" (spec troca-de-design-estante, decisão 1). O `magenta` (o padrão
 * de antes) e o antigo `azul` (`capa-1`, azul-claro) caem em `azul` (o padrão novo), SEM tentar distinguir
 * quem escolheu de quem ficou no padrão; `violeta` e `laranja` ficam. Valor desconhecido não é tocado: a validação da
 * entrada o recusa e só aquele usuário volta aos padrões.
 */
const DESTAQUE_NOVO: Readonly<Record<string, string>> = {
  magenta: 'azul',
  azul: 'azul',
  violeta: 'violeta',
  laranja: 'laranja',
};

const isRegistro = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

/**
 * Migração 1 → 2: reescreve o `destaque` de cada entrada de `porUsuario` em `checkpoint:prefs`. Nunca lança:
 * chave ausente (ninguém tinha preferências), JSON ilegível ou de outro formato ficam como estão (a chave, ao ser lida,
 * devolve os padrões). Só o `destaque` muda; o resto de cada entrada e as outras chaves ficam intactos.
 */
export function migrarDestaques(raw: RawStorage = storage.raw): void {
  const texto = raw.get(PREFS_NAME);
  if (texto === null) {
    return;
  }
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    return;
  }
  if (!isRegistro(valor) || !isRegistro(valor.porUsuario)) {
    return;
  }
  for (const entrada of Object.values(valor.porUsuario)) {
    if (isRegistro(entrada) && typeof entrada.destaque === 'string') {
      entrada.destaque = DESTAQUE_NOVO[entrada.destaque] ?? entrada.destaque;
    }
  }
  raw.set(PREFS_NAME, JSON.stringify(valor));
}

/** `MIGRATIONS[n]` migra os dados da versão `n` para `n + 1`. A 1 → 2 troca as cores de destaque. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: (raw) => migrarDestaques(raw),
};

/** Fora do registro: quem a gere é este módulo, não uma feature. */
const VERSION_NAME = `${STORAGE_PREFIX}versao`;

export interface MigrationOptions {
  raw?: RawStorage;
  current?: number;
  migrations?: Readonly<Record<number, Migration>>;
}

/** Inteiro ≥ 1, ou `null` se o valor gravado não for um número de versão. */
function parseVersion(raw: string): number | null {
  return /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
}

/**
 * Roda no boot, antes do primeiro render (main.tsx). Nunca lança.
 *
 * - versão ausente → grava a atual (primeiro uso);
 * - menor que a atual → aplica as migrações em ordem e grava a atual;
 * - maior que a atual (voltou de versão), ilegível, ou uma migração lançou → apaga TODAS as chaves
 *   `checkpoint:` (e só elas) e grava a atual. Perder preferências é melhor que ler dados num formato
 *   que o código não entende; uma chave de outro app no mesmo origin nunca é tocada.
 */
export function runStorageMigrations(options: MigrationOptions = {}): void {
  const raw = options.raw ?? storage.raw;
  const current = options.current ?? STORAGE_SCHEMA_VERSION;
  const migrations = options.migrations ?? MIGRATIONS;

  function resetAll(): void {
    raw.removeAllWithPrefix(STORAGE_PREFIX);
    raw.set(VERSION_NAME, String(current));
  }

  const stored = raw.get(VERSION_NAME);
  if (stored === null) {
    raw.set(VERSION_NAME, String(current));
    return;
  }

  const version = parseVersion(stored);
  if (version === null || version > current) {
    resetAll();
    return;
  }

  if (version === current) {
    return;
  }

  try {
    for (let from = version; from < current; from += 1) {
      const migrate = migrations[from];
      if (!migrate) {
        throw new Error(`Falta a migração ${from} → ${from + 1}`);
      }
      migrate(raw);
    }
    raw.set(VERSION_NAME, String(current));
  } catch {
    resetAll();
  }
}
