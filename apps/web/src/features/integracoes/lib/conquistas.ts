import { type Conquista, type DadosJogoPlataforma, type Game } from '@checkpoint/shared';

const DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const PERCENTUAL = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** "dd/mm/aaaa" no fuso do usuário; texto ilegível vira `null` (nunca "Invalid Date"). */
export function dataCurta(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : DATA.format(data);
}

/** "42 h 30 min", "42 h", "45 min" e "0 min" (a Steam conta em minutos; aqui nunca se promete mais do que ela contou). */
export function horasEMinutos(minutos: number): string {
  const total = Math.max(0, Math.floor(minutos));
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  if (horas === 0) {
    return `${resto} min`;
  }
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/** "Último jogo em dd/mm/aaaa", ou "Nunca jogado" quando a data é nula (a Steam manda 0 para "nunca"). */
export function ultimoJogoTexto(iso: string | null): string {
  const data = dataCurta(iso);
  return data === null ? 'Nunca jogado' : `Último jogo em ${data}`;
}

/** "12,4% dos jogadores", ou "Raridade indisponível" quando a Steam não devolveu o percentual. */
export function raridadeTexto(percentual: number | null): string {
  return percentual === null
    ? 'Raridade indisponível'
    : `${PERCENTUAL.format(percentual)}% dos jogadores`;
}

/** "Desbloqueada em dd/mm/aaaa", ou `null` quando não há data (nunca inventa uma). */
export function desbloqueadaEmTexto(iso: string | null): string | null {
  const data = dataCurta(iso);
  return data === null ? null : `Desbloqueada em ${data}`;
}

/** As duas listas da página: desbloqueadas (mais recente primeiro) e as que faltam (da mais comum à mais rara). */
export function separarConquistas(conquistas: readonly Conquista[]): {
  desbloqueadas: Conquista[];
  faltam: Conquista[];
} {
  const tempo = (iso: string | null): number => (iso === null ? 0 : new Date(iso).getTime() || 0);
  const desbloqueadas = conquistas
    .filter((conquista) => conquista.desbloqueada)
    .sort(
      (a, b) =>
        tempo(b.desbloqueadaEm) - tempo(a.desbloqueadaEm) || a.nome.localeCompare(b.nome, 'pt-BR'),
    );
  const faltam = conquistas
    .filter((conquista) => !conquista.desbloqueada)
    // Sem percentual vai para o fim (não dá para dizer que é rara): comparar como -1 a põe depois de qualquer valor.
    .sort(
      (a, b) =>
        (b.raridadePercentual ?? -1) - (a.raridadePercentual ?? -1) ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    );
  return { desbloqueadas, faltam };
}

/** O que a barra de progresso mostra: "12 de 40 conquistas" e a fração (0 a 100). `null` sem total (nada a mostrar). */
export function progressoDasConquistas(
  desbloqueadas: number | null,
  total: number | null,
): { texto: string; percentual: number; desbloqueadas: number; total: number } | null {
  if (desbloqueadas === null || total === null || total <= 0) {
    return null;
  }
  return {
    texto: `${desbloqueadas} de ${total} ${total === 1 ? 'conquista' : 'conquistas'}`,
    percentual: Math.min(100, Math.round((desbloqueadas / total) * 100)),
    desbloqueadas,
    total,
  };
}

/**
 * Atualiza, no cache do catálogo, só a camada da plataforma de UM jogo (o detalhe acabou de trazer valores novos), sem
 * refazer a lista inteira. Pura: devolve a lista nova, ou a mesma se o jogo não estiver nela.
 */
export function comDadosAtualizados(
  jogos: readonly Game[] | undefined,
  jogoId: string,
  dados: DadosJogoPlataforma,
): Game[] | undefined {
  if (!jogos) {
    return undefined;
  }
  return jogos.map((jogo) =>
    jogo.id === jogoId
      ? {
          ...jogo,
          dadosPlataforma: jogo.dadosPlataforma.map((atual) =>
            atual.provedor === dados.provedor ? dados : atual,
          ),
        }
      : jogo,
  );
}
