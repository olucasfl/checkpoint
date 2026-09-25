import { type DadosJogoPlataforma, type Provedor } from '@checkpoint/shared';

/** As colunas de `JogoPlataforma` que viram `DadosJogoPlataforma` (lista branca: nunca `userId` nem `gameId`). */
export const DADOS_JOGO_PLATAFORMA_SELECT = {
  provedor: true,
  idExterno: true,
  minutosJogados: true,
  ultimaVezJogadoEm: true,
  conquistasTotal: true,
  conquistasDesbloqueadas: true,
  capaUrl: true,
  atualizadoEm: true,
} as const;

export interface DadosJogoPlataformaRow {
  provedor: Provedor;
  idExterno: string;
  minutosJogados: number;
  ultimaVezJogadoEm: Date | null;
  conquistasTotal: number | null;
  conquistasDesbloqueadas: number | null;
  capaUrl: string | null;
  atualizadoEm: Date;
}

/** Uma linha de `JogoPlataforma` no contrato do `shared`. Pura: usada pelo `PUT` do vínculo e pela lista de jogos. */
export function toDadosJogoPlataforma(row: DadosJogoPlataformaRow): DadosJogoPlataforma {
  return {
    provedor: row.provedor,
    idExterno: row.idExterno,
    minutosJogados: row.minutosJogados,
    ultimaVezJogadoEm: row.ultimaVezJogadoEm?.toISOString() ?? null,
    conquistasTotal: row.conquistasTotal,
    conquistasDesbloqueadas: row.conquistasDesbloqueadas,
    capaUrl: row.capaUrl,
    atualizadoEm: row.atualizadoEm.toISOString(),
  };
}
