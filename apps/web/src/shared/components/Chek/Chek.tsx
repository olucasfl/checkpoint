import { useId } from 'react';
import { RostoCadeado, RostoComemorando, RostoConfuso, RostoDormindo, RostoFeliz } from './Rostos';

export type ChekExpressao = 'feliz' | 'dormindo' | 'confuso' | 'comemorando' | 'cadeado';

interface ChekProps {
  expressao?: ChekExpressao;
  /** Altura em px. Sem ela, a altura vem do `className` (ex.: `h-9 md:h-11`), e a largura acompanha. */
  altura?: number;
  /** A bandeira balança (só o carregamento usa; para com movimento reduzido, pela regra global). */
  animado?: boolean;
  /** Com título, o Chek vira `role="img"`; sem ele é decorativo (`aria-hidden`). */
  titulo?: string;
  className?: string;
}

/**
 * Recorte de cada expressão: o corpo é o mesmo, mas as estrelas e o "?" passam do cartucho e pedem mais largura.
 * [x, y, largura, altura] no desenho de 512 × 512 do mascote.
 */
const CAIXAS: Record<ChekExpressao, readonly [number, number, number, number]> = {
  feliz: [120, 76, 272, 380],
  dormindo: [120, 76, 272, 380],
  cadeado: [120, 76, 272, 380],
  confuso: [120, 76, 328, 380],
  comemorando: [64, 76, 400, 380],
};

/**
 * O mascote Chek (um cartucho de jogo com carinha e uma bandeira de checkpoint como antena), em SVG inline com as
 * cores por tokens (`var(--color-*)`): é a marca, então NÃO segue a cor de destaque escolhida no /perfil. O corpo é
 * o do mestre em `docs/design/marca`; só o rosto muda. Cada instância tem gradientes com id próprio.
 */
export function Chek({
  expressao = 'feliz',
  altura,
  animado = false,
  titulo,
  className,
}: ChekProps) {
  const uid = useId().replace(/:/g, '');
  const azul = `chek-azul-${uid}`;
  const ouro = `chek-ouro-${uid}`;
  const [x, y, largura, alto] = CAIXAS[expressao];

  return (
    <svg
      viewBox={`${x} ${y} ${largura} ${alto}`}
      style={altura ? { height: altura } : undefined}
      className={`chek block shrink-0 ${className ?? ''}`}
      data-chek={expressao}
      {...(titulo
        ? { role: 'img', 'aria-label': titulo }
        : { 'aria-hidden': true, focusable: 'false' })}
    >
      <defs>
        <linearGradient id={azul} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--color-chek-corpo-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-chek-corpo-2)' }} />
        </linearGradient>
        <linearGradient id={ouro} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--color-ouro-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-ouro-2)' }} />
        </linearGradient>
      </defs>

      <ellipse
        cx="256"
        cy="440"
        rx="112"
        ry="12"
        style={{ fill: 'var(--color-fundo)' }}
        fillOpacity="0.6"
      />
      <g className={animado ? 'chek-bandeira' : undefined}>
        <rect
          x="252"
          y="82"
          width="8"
          height="74"
          rx="4"
          style={{ fill: 'var(--color-chek-mastro)' }}
        />
        <path d="M260 84 L326 104 L260 126 Z" fill={`url(#${ouro})`} />
      </g>
      <rect x="136" y="148" width="240" height="262" rx="46" fill={`url(#${azul})`} />
      <rect
        x="176"
        y="392"
        width="160"
        height="34"
        rx="9"
        style={{ fill: 'var(--color-chek-base)' }}
      />
      <g style={{ fill: 'var(--color-ouro)' }}>
        {[192, 214, 236, 258, 280, 302].map((px) => (
          <rect key={px} x={px} y="402" width="9" height="24" rx="2" />
        ))}
      </g>
      <rect
        x="164"
        y="182"
        width="184"
        height="158"
        rx="34"
        style={{ fill: 'var(--color-fundo)' }}
      />
      <rect
        x="152"
        y="352"
        width="208"
        height="8"
        rx="4"
        style={{ fill: 'var(--color-fundo)' }}
        fillOpacity="0.22"
      />

      {expressao === 'feliz' && <RostoFeliz />}
      {expressao === 'dormindo' && <RostoDormindo />}
      {expressao === 'confuso' && <RostoConfuso />}
      {expressao === 'comemorando' && <RostoComemorando ouro={`url(#${ouro})`} />}
      {expressao === 'cadeado' && <RostoCadeado ouro={`url(#${ouro})`} />}
    </svg>
  );
}
