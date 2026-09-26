import { GameCover } from '@/features/games/components/GameCover';
import type { Densidade, Efeitos } from '@/shared/lib/prefs/prefs';

/** Jogos de exemplo, sintéticos: a prévia não lê o catálogo da pessoa. */
const EXEMPLOS = [
  { titulo: 'Jogo de exemplo', detalhe: 'PS5' },
  { titulo: 'Outro exemplo', detalhe: 'PC' },
] as const;

/**
 * Dois tiles de exemplo no tamanho da densidade escolhida (as mesmas capas em pé do catálogo: 132 × 176 ou 108 × 144
 * no celular), para ver a diferença sem sair do modal.
 */
export function PreviaDensidade({ densidade }: { densidade: Densidade }) {
  const compacta = densidade === 'compacta';
  return (
    <ul
      aria-label="Prévia da densidade"
      data-densidade={densidade}
      className="m-0 flex list-none gap-3.5 rounded-2xl bg-painel-2 p-3"
    >
      {EXEMPLOS.map((exemplo) => (
        <li
          key={exemplo.titulo}
          className={`flex flex-col gap-1.5 ${compacta ? 'w-[108px]' : 'w-[132px]'}`}
        >
          <GameCover
            titulo={exemplo.titulo}
            capaUrl={null}
            variant={compacta ? 'tileCompacto' : 'tile'}
          />
          <span className="truncate font-display text-[15px] font-semibold">{exemplo.titulo}</span>
          <span className="truncate text-[13px] text-texto-suave">{exemplo.detalhe}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Uma amostra de movimento: um tile de exemplo que sobe e desce em laço (`previa-elevar`). A regra de
 * `html[data-efeitos]` (variante `movimento-reduzido`) o para aqui também, então o quadro mostra o que a escolha faz;
 * o texto diz o estado sem depender só do movimento.
 */
export function PreviaEfeitos({ efeitos }: { efeitos: Efeitos }) {
  return (
    <div
      data-efeitos-previa={efeitos}
      className="flex items-center gap-4 overflow-hidden rounded-2xl bg-fundo p-3"
    >
      <div data-previa-tile className="previa-elevar shrink-0">
        <GameCover titulo="Jogo de exemplo" capaUrl={null} variant="preview" />
      </div>
      <span className="text-[15px] font-semibold">
        {efeitos === 'completos' ? 'Animações ligadas' : 'Animações desligadas, sem movimento'}
      </span>
    </div>
  );
}
