import { useRef, type KeyboardEvent } from 'react';
import { Icon } from '@/shared/components/Icon';

export interface Opcao<T extends string> {
  valor: T;
  rotulo: string;
  /** Só na variante `bolinha`: classe do token da cor (ex.: `bg-capa-6`), nunca um hex. */
  cor?: string;
}

interface GrupoOpcoesProps<T extends string> {
  id: string;
  titulo: string;
  opcoes: readonly Opcao<T>[];
  valor: T;
  onChange: (valor: T) => void;
  /** `bolinha`: só a amostra da cor, com o rótulo no `aria-label` (a cor de destaque). */
  variante?: 'texto' | 'bolinha';
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
  variante = 'texto',
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
    <div className="flex flex-col gap-2.5">
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
              aria-label={variante === 'bolinha' ? opcao.rotulo : undefined}
              tabIndex={marcada ? 0 : -1}
              onClick={() => onChange(opcao.valor)}
              onKeyDown={(event) => onKeyDown(event, indice)}
              className={
                variante === 'bolinha'
                  ? `grid size-11 place-items-center rounded-full border-2 ${
                      marcada ? 'border-texto' : 'border-transparent'
                    }`
                  : `flex min-h-11 min-w-11 items-center gap-2 rounded-xl border px-4 text-[16px] font-semibold ${
                      marcada
                        ? 'border-destaque bg-painel-2 text-texto'
                        : 'border-borda-controle text-texto-suave hover:text-texto'
                    }`
              }
            >
              {variante === 'bolinha' ? (
                <span
                  className={`grid size-7 place-items-center rounded-full text-fundo ${opcao.cor ?? ''}`}
                >
                  {marcada && <Icon name="check" size={18} />}
                </span>
              ) : (
                opcao.rotulo
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
