import { GameCover } from '@/features/games/components/GameCover';
import type { Densidade, Efeitos } from '@/shared/lib/prefs/prefs';

/** Jogos de exemplo, sintéticos: a prévia não lê o catálogo da pessoa. */
const EXEMPLOS = [
  { titulo: 'Jogo de exemplo', detalhe: 'PS5 · Jogando' },
  { titulo: 'Outro exemplo', detalhe: 'PC · Zerado' },
] as const;

/**
 * Duas linhas de jogo no formato da densidade escolhida (as mesmas medidas da `GameRow`: capa 52 ou
 * 40 e o espaço da linha), para ver a diferença sem sair do modal.
 */
export function PreviaDensidade({ densidade }: { densidade: Densidade }) {
  const compacta = densidade === 'compacta';
  return (
    <ul
      aria-label="Prévia da densidade"
      data-densidade={densidade}
      className="m-0 flex list-none flex-col gap-1.5 rounded-2xl bg-painel-2 p-2"
    >
      {EXEMPLOS.map((exemplo) => (
        <li
          key={exemplo.titulo}
          className={`flex items-center gap-3 rounded-xl bg-painel px-3 ${compacta ? 'py-1' : 'py-2.5'}`}
        >
          <GameCover
            titulo={exemplo.titulo}
            capaUrl={null}
            variant={compacta ? 'compacta' : 'row'}
          />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[17px] font-bold">{exemplo.titulo}</span>
            <span className="truncate text-[15px] text-texto-suave">{exemplo.detalhe}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Uma amostra de movimento: um esqueleto que anima. A regra de `html[data-efeitos]` (variante `movimento-reduzido`)
 * o para aqui também, então o quadro mostra o que a escolha faz; o texto diz o estado sem depender só do movimento.
 */
export function PreviaEfeitos({ efeitos }: { efeitos: Efeitos }) {
  return (
    <div
      data-efeitos-previa={efeitos}
      className="relative flex h-20 flex-col justify-end gap-2 overflow-hidden rounded-2xl bg-fundo p-3"
    >
      <div aria-hidden="true" className="skeleton h-3 w-2/3 rounded-full" />
      <span className="relative text-[15px] font-semibold">
        {efeitos === 'completos' ? 'Animações ligadas' : 'Animações desligadas, sem movimento'}
      </span>
    </div>
  );
}
