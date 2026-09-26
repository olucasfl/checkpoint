import { type StatusNaPlataforma } from '@checkpoint/shared';

/** A fatia do backlog na biblioteca, em % inteira. Biblioteca vazia não divide por zero. */
export function percentualDoBacklog(nuncaJogados: number, totalJogos: number): number {
  if (totalJogos <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((nuncaJogados / totalJogos) * 100)));
}

/** "Online", "Offline" ou "Jogando Celeste"; sem o dado (perfil que não o devolve), `null` (o bloco some). */
export function textoDoStatus(
  status: StatusNaPlataforma | null,
  jogandoAgora: string | null,
): string | null {
  if (status === 'jogando') {
    return jogandoAgora ? `Jogando ${jogandoAgora}` : 'Em jogo';
  }
  if (status === 'online') {
    return 'Online';
  }
  return status === 'offline' ? 'Offline' : null;
}

/** "12 dos seus 38 jogos já estão no checkpoint" (com o singular certo). */
export function textoNoCheckpoint(ligados: number, naBiblioteca: number): string {
  const jogos = naBiblioteca === 1 ? 'jogo' : 'jogos';
  const verbo = ligados === 1 ? 'já está' : 'já estão';
  return `${ligados} dos seus ${naBiblioteca} ${jogos} ${verbo} no checkpoint`;
}

/** "120 nunca abertos", "1 nunca aberto". */
export function textoDoBacklog(nuncaJogados: number): string {
  return `${nuncaJogados} ${nuncaJogados === 1 ? 'nunca aberto' : 'nunca abertos'}`;
}
