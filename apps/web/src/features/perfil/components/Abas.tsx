import { useRef, type KeyboardEvent } from 'react';

export interface Aba {
  id: string;
  rotulo: string;
}

export const idDaAba = (base: string, id: string) => `${base}-aba-${id}`;
export const idDoPainel = (base: string, id: string) => `${base}-painel-${id}`;

interface AbasProps {
  /** Prefixo dos ids: a aba e o painel se apontam por `aria-controls`/`aria-labelledby`. */
  base: string;
  rotulo: string;
  abas: readonly Aba[];
  ativa: string;
  onChange: (id: string) => void;
}

/**
 * Só a lista de abas (`tablist`); o painel de cada uma é de quem usa, com `role="tabpanel"` e os ids
 * de `idDoPainel`. Ativação automática: as setas movem o foco e já trocam de aba, e só a ativa entra
 * no Tab (o padrão WAI-ARIA para abas de poucas opções, sem conteúdo caro de montar).
 */
export function Abas({ base, rotulo, abas, ativa, onChange }: AbasProps) {
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);

  function ir(indice: number) {
    const aba = abas[indice];
    if (aba) {
      onChange(aba.id);
      botoes.current[indice]?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent, indice: number) {
    if (event.key === 'ArrowRight') {
      ir((indice + 1) % abas.length);
    } else if (event.key === 'ArrowLeft') {
      ir((indice - 1 + abas.length) % abas.length);
    } else if (event.key === 'Home') {
      ir(0);
    } else if (event.key === 'End') {
      ir(abas.length - 1);
    } else {
      return;
    }
    event.preventDefault();
  }

  return (
    <div role="tablist" aria-label={rotulo} className="flex gap-1 border-b border-borda">
      {abas.map((aba, indice) => {
        const marcada = aba.id === ativa;
        return (
          <button
            key={aba.id}
            ref={(el) => {
              botoes.current[indice] = el;
            }}
            id={idDaAba(base, aba.id)}
            type="button"
            role="tab"
            aria-selected={marcada}
            aria-controls={idDoPainel(base, aba.id)}
            tabIndex={marcada ? 0 : -1}
            onClick={() => onChange(aba.id)}
            onKeyDown={(event) => onKeyDown(event, indice)}
            className={`-mb-px min-h-11 flex-1 rounded-t-xl border-b-2 px-3 text-[16px] font-semibold ${
              marcada
                ? 'border-destaque text-texto'
                : 'border-transparent text-texto-suave hover:text-texto'
            }`}
          >
            {aba.rotulo}
          </button>
        );
      })}
    </div>
  );
}
