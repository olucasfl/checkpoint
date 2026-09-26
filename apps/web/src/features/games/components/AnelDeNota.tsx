import { type CSSProperties } from 'react';
import { GAME_RATING_MAX } from '@checkpoint/shared';
import { formatRating } from '../lib/rating-input';

interface AnelDeNotaProps {
  /** A média (0 a 10) ou `null`: sem média, **sem anel** (nada é renderizado). */
  nota: number | null;
  /** `grande` é o anel de 92 px do detalhe (arco `destaque`, com "de 10"); o padrão é o do canto da capa. */
  tamanho?: 'tile' | 'grande';
}

/**
 * O anel da média no canto da capa (spec `troca-de-design-estante`): um arco `texto` (`conic-gradient`, com a fração em
 * `--pct`) sobre um trilho escuro, com o número no miolo. O anel INTEIRO é uma imagem com o nome "Nota 8,3 de 10"; o
 * número visível fica `aria-hidden` para não ser lido duas vezes. Média 0 é nota: anel vazio e "0,0".
 */
export function AnelDeNota({ nota, tamanho = 'tile' }: AnelDeNotaProps) {
  if (nota === null) {
    return null;
  }
  const texto = formatRating(nota);
  const pct = Math.min(100, Math.max(0, nota * 10));

  if (tamanho === 'grande') {
    return (
      <div
        role="img"
        aria-label={`Nota ${texto} de ${GAME_RATING_MAX}`}
        data-anel-nota="grande"
        style={{ '--pct': pct } as CSSProperties}
        className="anel-nota-grande grid size-[92px] shrink-0 place-items-center rounded-full"
      >
        <span
          aria-hidden="true"
          className="flex size-[76px] flex-col items-center justify-center rounded-full bg-fundo"
        >
          <span className="font-display text-[28px] font-extrabold leading-none">{texto}</span>
          <span className="mt-0.5 text-[11px] font-bold leading-none text-texto-suave">
            de {GAME_RATING_MAX}
          </span>
        </span>
      </div>
    );
  }

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
