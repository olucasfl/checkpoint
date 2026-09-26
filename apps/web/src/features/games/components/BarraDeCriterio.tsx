import { GAME_RATING_MAX } from '@checkpoint/shared';
import { formatRating } from '../lib/rating-input';

/**
 * A nota de um critério no detalhe: barra contínua de 10 px (`destaque` sobre o trilho `borda`, 4,64:1) e a nota em
 * Outfit com vírgula e 1 casa. A barra é a imagem ("Gameplay 9,2 de 10"). Sem nota, "sem nota" e a barra vazia: o 0 é
 * uma nota (barra vazia e "0,0"), e vazio não é 0.
 */
export function BarraDeCriterio({ nota, rotulo }: { nota: number | null; rotulo: string }) {
  const largura = nota === null ? 0 : Math.min(100, Math.max(0, nota * 10));
  const texto = nota === null ? null : formatRating(nota);

  return (
    <>
      <div
        {...(texto === null
          ? { 'aria-hidden': true }
          : { role: 'img', 'aria-label': `${rotulo} ${texto} de ${GAME_RATING_MAX}` })}
        className="h-2.5 overflow-hidden rounded-full bg-borda"
      >
        <div className="h-full rounded-full bg-destaque" style={{ width: `${largura}%` }} />
      </div>
      {texto === null ? (
        <span className="text-right text-xs font-semibold text-texto-suave">sem nota</span>
      ) : (
        <span aria-hidden="true" className="text-right font-display text-[17px] font-extrabold">
          {texto}
        </span>
      )}
    </>
  );
}
