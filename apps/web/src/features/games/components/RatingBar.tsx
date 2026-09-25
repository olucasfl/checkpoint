import { GAME_RATING_MAX } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';

interface RatingBarProps {
  nota: number | null;
  /** Densidade compacta (preferência do /perfil): em >= 768px, sem a legenda, a barra fica numa linha só. */
  compacta?: boolean;
}

const SEGMENTS = Array.from({ length: GAME_RATING_MAX }, (_, index) => index);

/**
 * Nota da linha: legenda "NOTA", barra de 10 segmentos e o número com estrela e "/10", para
 * ninguém confundir com outro número da tela. O número usa a Rajdhani (legível: na Orbitron o 0 tem
 * barra e o 8 fica ambíguo). Nota 0 = nenhum segmento preenchido e o "0". Vazia = "SEM NOTA". Os
 * segmentos vazios usam `apagado` (só decorativo: o número diz a nota).
 */
export function RatingBar({ nota, compacta = false }: RatingBarProps) {
  if (nota === null) {
    return (
      <span className="flex items-center gap-1.5 text-[15px] font-semibold tracking-[0.16em] text-texto-suave">
        <Icon name="star" size={18} />
        SEM NOTA
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span
        className={`text-[11px] font-bold uppercase leading-none tracking-[0.22em] text-texto-suave ${compacta ? 'md:hidden' : ''}`}
      >
        Nota
      </span>
      <div className="flex items-center gap-3">
        <div
          role="img"
          aria-label={`Nota ${nota} de ${GAME_RATING_MAX}`}
          className="flex gap-[3px]"
          data-filled={nota}
        >
          {SEGMENTS.map((index) => (
            <span
              key={index}
              data-segment={index < nota ? 'on' : 'off'}
              className={`h-4 w-[11px] rounded-[1px] ${index < nota ? 'glow-seg bg-magenta' : 'bg-apagado'}`}
            />
          ))}
        </div>
        <span aria-hidden="true" className="flex items-center gap-1 font-corpo tabular-nums">
          <Icon name="star" size={18} filled className="text-magenta" />
          <span className="text-2xl font-bold leading-none">{nota}</span>
          <span className="text-base font-semibold leading-none text-texto-suave">
            /{GAME_RATING_MAX}
          </span>
        </span>
      </div>
    </div>
  );
}
