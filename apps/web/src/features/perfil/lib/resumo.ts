import { type StatusCounts } from '@/features/games/lib/count-by-status';

/** Enquanto a lista de jogos carrega (ou não carregou), o resumo mostra só este traço. */
export const RESUMO_CARREGANDO = '—';

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/**
 * "12 jogos · 5 zerados · 3 jogando · 4 quero jogar", a partir das mesmas contagens do catálogo (sem
 * endpoint novo). "Jogando" e "quero jogar" não flexionam.
 */
export function resumoDoCatalogo(counts: StatusCounts | undefined): string {
  if (!counts) {
    return RESUMO_CARREGANDO;
  }
  return [
    plural(counts.total, 'jogo', 'jogos'),
    plural(counts.ZERADO, 'zerado', 'zerados'),
    `${counts.JOGANDO} jogando`,
    `${counts.QUERO_JOGAR} quero jogar`,
  ].join(' · ');
}

const MES_E_ANO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

/** "Membro desde setembro de 2026" (mês no fuso do aparelho). Data inválida → `null`. */
export function membroDesde(criadoEm: string): string | null {
  const data = new Date(criadoEm);
  return Number.isNaN(data.getTime()) ? null : `Membro desde ${MES_E_ANO.format(data)}`;
}
