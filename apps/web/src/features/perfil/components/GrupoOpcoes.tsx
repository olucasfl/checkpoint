import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface Opcao<T extends string> {
  valor: T;
  rotulo: string;
  /** Algo antes do rótulo (a amostra da cor de destaque). */
  antes?: ReactNode;
}

interface GrupoOpcoesProps<T extends string> {
  id: string;
  titulo: string;
  opcoes: readonly Opcao<T>[];
  valor: T;
  onChange: (valor: T) => void;
}

const PROXIMA: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Uma preferência de escolha única: `radiogroup` de botões com `aria-checked`. Muda na hora (sem
 * Salvar). Só a opção marcada entra no Tab; as setas trocam e marcam, como num grupo de rádios.
 */
export function GrupoOpcoes<T extends string>({
  id,
  titulo,
  opcoes,
  valor,
  onChange,
}: GrupoOpcoesProps<T>) {
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, indice: number) {
    const passo = PROXIMA[event.key];
    if (passo === undefined) {
      return;
    }
    event.preventDefault();
    const proximo = (indice + passo + opcoes.length) % opcoes.length;
    const opcao = opcoes[proximo];
    if (opcao) {
      onChange(opcao.valor);
      botoes.current[proximo]?.focus();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div id={id} className="text-[16px] font-semibold">
        {titulo}
      </div>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2">
        {opcoes.map((opcao, indice) => {
          const marcada = opcao.valor === valor;
          return (
            <button
              key={opcao.valor}
              ref={(el) => {
                botoes.current[indice] = el;
              }}
              type="button"
              role="radio"
              aria-checked={marcada}
              tabIndex={marcada ? 0 : -1}
              onClick={() => onChange(opcao.valor)}
              onKeyDown={(event) => onKeyDown(event, indice)}
              className={`flex min-h-11 min-w-11 items-center gap-2 rounded-[4px] border px-3 text-[16px] font-semibold ${
                marcada
                  ? 'border-ciano bg-painel-2 text-ciano'
                  : 'border-borda-controle text-texto-suave hover:text-texto'
              }`}
            >
              {opcao.antes}
              {opcao.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}
