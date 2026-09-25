import { GAME_RATING_MAX } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { formatRating } from '../lib/rating-input';

interface RatingBarProps {
  nota: number | null;
  /**
   * Nome do critério para o `aria-label` ("Gameplay 9,2 de 10"); sem ele, é a nota geral ("Nota 8,3 de
   * 10"). Também escolhe a legenda "NOTA" da linha.
   */
  rotulo?: string;
  /** Densidade compacta (preferência do /perfil): em >= 768px, sem a legenda, a barra fica numa linha só. */
  compacta?: boolean;
  /** Sem nota: `traco` é o "—" discreto da lista; `texto` é o "sem nota" de um critério no detalhe. */
  vazio?: 'traco' | 'texto';
}

const SEGMENTS = Array.from({ length: GAME_RATING_MAX }, (_, index) => index);

/**
 * Nota como barra de 10 segmentos + estrela, o número (com vírgula e 1 casa) e "/10", para ninguém
 * confundir com outro número da tela. O número usa a Rajdhani (legível: na Orbitron o 0 tem barra e o 8 fica
 * ambíguo). A nota é decimal (8,3): a barra preenche `round(nota)` segmentos e o número diz o valor exato.
 * Nota 0 = nenhum segmento e "0,0"; sem nota, o "—" ou o "sem nota" (segmentos vazios são só decorativos).
 */
export function RatingBar({ nota, rotulo, compacta = false, vazio = 'traco' }: RatingBarProps) {
  if (nota === null) {
    return vazio === 'traco' ? (
      <span
        role="img"
        aria-label="Sem nota"
        className="flex items-center gap-1.5 text-[15px] font-semibold text-texto-suave"
      >
        <Icon name="star" size={18} />—
      </span>
    ) : (
      <span className="flex items-center gap-1.5 text-[15px] font-semibold tracking-[0.16em] text-texto-suave">
        <Icon name="star" size={18} />
        SEM NOTA
      </span>
    );
  }

  const cheios = Math.round(nota);
  const texto = formatRating(nota);

  return (
    <div className="flex flex-col gap-1">
      {rotulo === undefined && (
        <span
          className={`text-[11px] font-bold uppercase leading-none tracking-[0.22em] text-texto-suave ${compacta ? 'md:hidden' : ''}`}
        >
          Nota
        </span>
      )}
      <div className="flex items-center gap-3">
        <div
          role="img"
          aria-label={`${rotulo ?? 'Nota'} ${texto} de ${GAME_RATING_MAX}`}
          className="flex gap-[3px]"
          data-filled={cheios}
        >
          {SEGMENTS.map((index) => (
            <span
              key={index}
              data-segment={index < cheios ? 'on' : 'off'}
              className={`h-4 w-[11px] rounded-[1px] ${index < cheios ? 'glow-seg bg-magenta' : 'bg-apagado'}`}
            />
          ))}
        </div>
        <span aria-hidden="true" className="flex items-center gap-1 font-corpo tabular-nums">
          <Icon name="star" size={18} filled className="text-magenta" />
          <span className="text-2xl font-bold leading-none">{texto}</span>
          <span className="text-base font-semibold leading-none text-texto-suave">
            /{GAME_RATING_MAX}
          </span>
        </span>
      </div>
    </div>
  );
}
