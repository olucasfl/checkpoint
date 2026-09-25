import { TtlCache } from './ttl-cache';

/**
 * Um `TtlCache` que também junta chamadas simultâneas: duas aberturas do mesmo detalhe ao mesmo tempo (duas abas)
 * esperam a MESMA consulta em vez de gastar a cota da chave duas vezes. Só o sucesso entra no cache; erro não
 * é lembrado, e a próxima chamada tenta de novo. Sem chave nem dado do usuário em log: este arquivo não loga.
 */
export class CarregadorEmCache<V> {
  private readonly cache: TtlCache<V>;
  private readonly emVoo = new Map<string, Promise<V>>();

  constructor(ttlMs: number, maxEntries: number, now?: () => number) {
    this.cache = new TtlCache<V>(ttlMs, maxEntries, now);
  }

  /** `ignorarCache` (o "Atualizar" manual) pula o valor guardado e a consulta em voo, e grava o resultado novo. */
  async obter(
    chave: string,
    carregar: () => Promise<V>,
    opcoes: { ignorarCache?: boolean } = {},
  ): Promise<V> {
    if (!opcoes.ignorarCache) {
      const guardado = this.cache.get(chave);
      if (guardado !== undefined) {
        return guardado;
      }
      const consulta = this.emVoo.get(chave);
      if (consulta) {
        return consulta;
      }
    }
    const promessa: Promise<V> = carregar()
      .then((valor) => {
        this.cache.set(chave, valor);
        return valor;
      })
      .finally(() => {
        if (this.emVoo.get(chave) === promessa) {
          this.emVoo.delete(chave);
        }
      });
    this.emVoo.set(chave, promessa);
    return promessa;
  }
}
