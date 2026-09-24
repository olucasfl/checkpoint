import { type StorageBackend } from './storage';

/** Armazenamento falso dos testes, com falhas injetáveis (bloqueado, cota cheia, leitura quebrada). */
export class FakeStorage implements StorageBackend {
  private readonly data = new Map<string, string>();

  /** Erro que `setItem` lança (ex.: cota cheia). */
  setError: Error | null = null;
  /** Erro que `getItem` lança. */
  getError: Error | null = null;

  get length(): number {
    return this.data.size;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  getItem(name: string): string | null {
    if (this.getError) {
      throw this.getError;
    }
    return this.data.get(name) ?? null;
  }

  setItem(name: string, value: string): void {
    if (this.setError) {
      throw this.setError;
    }
    this.data.set(name, value);
  }

  removeItem(name: string): void {
    this.data.delete(name);
  }

  /** Grava direto, sem passar por `setError` (para montar o estado inicial de um teste). */
  seed(entries: Record<string, string>): this {
    for (const [name, value] of Object.entries(entries)) {
      this.data.set(name, value);
    }
    return this;
  }

  /** Tudo o que está gravado, para comparar no fim de um teste. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.data);
  }
}

/** `QuotaExceededError` como o navegador o lança. */
export function quotaError(): DOMException {
  return new DOMException('The quota has been exceeded.', 'QuotaExceededError');
}

/** `SecurityError` como o navegador o lança com cookies e dados de site bloqueados. */
export function securityError(): DOMException {
  return new DOMException('The operation is insecure.', 'SecurityError');
}
