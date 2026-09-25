/**
 * Cache em memória com validade e teto de entradas (spec `integracao-plataformas`, "Custo e cache"). Uma
 * instância só, como o throttler: some quando o Render dorme, e tudo bem, porque só protege a cota da chave
 * da Steam. Não é compartilhado entre processos e não guarda nada que não possa ser refeito.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiraEm: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    // Lambda (e não `Date.now` direto): o relógio é lido a cada uso, então um teste que troca `Date.now` vale.
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiraEm <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    // Regravar tira a entrada da ordem antiga: o "mais velho" é sempre o primeiro do Map.
    this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) {
        break;
      }
      this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expiraEm: this.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }
}
