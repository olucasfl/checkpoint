import { type CSSProperties } from 'react';
import { GAME_RATING_MAX } from '@checkpoint/shared';
import { formatRating } from '../lib/rating-input';

interface AnelDeNotaProps {
  /** A média (0 a 10) ou `null`: sem média, **sem anel** (nada é renderizado). */
  nota: number | null;
}

/**
 * O anel da média no canto da capa (spec `troca-de-design-estante`): um arco `texto` (`conic-gradient`, com a fração em
 * `--pct`) sobre um trilho escuro, com o número no miolo. O anel INTEIRO é uma imagem com o nome "Nota 8,3 de 10"; o
 * número visível fica `aria-hidden` para não ser lido duas vezes. Média 0 é nota: anel vazio e "0,0".
 */
export function AnelDeNota({ nota }: AnelDeNotaProps) {
  if (nota === null) {
    return null;
  }
  const texto = formatRating(nota);
  const pct = Math.min(100, Math.max(0, nota * 10));

  return (
    <div
      role="img"
      aria-label={`Nota ${texto} de ${GAME_RATING_MAX}`}
      data-anel-nota
      style={{ '--pct': pct } as CSSProperties}
      className="anel-nota grid size-9 shrink-0 place-items-center rounded-full md:size-10"
    >
      <span
        aria-hidden="true"
        className="grid size-[29px] place-items-center rounded-full bg-fundo font-display text-xs font-bold leading-none text-texto md:size-8 md:text-[13px]"
      >
        {texto}
      </span>
    </div>
  );
}
