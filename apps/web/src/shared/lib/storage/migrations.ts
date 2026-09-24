import { STORAGE_PREFIX } from './keys';
import { storage, type RawStorage } from './storage';

/**
 * Versão do formato dos dados locais. Toda mudança de formato de uma chave existente sobe esta
 * constante E acrescenta a migração em `MIGRATIONS`, no mesmo commit.
 */
export const STORAGE_SCHEMA_VERSION = 1;

export type Migration = () => void;

/** `MIGRATIONS[n]` migra os dados da versão `n` para `n + 1`. Vazio: a versão atual é a 1. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

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
      migrate();
    }
    raw.set(VERSION_NAME, String(current));
  } catch {
    resetAll();
  }
}
